import * as path from 'path';
import {
  closeSync,
  fstatSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
  type Stats
} from 'fs';
import { executeCommand } from './commandExecutor.js';
import { Logger } from './logger.js';
import {
  ERROR_MESSAGES,
  STATUS_MESSAGES,
  MODELS,
  CLI
} from '../constants.js';

import { parseChangeModeOutput, validateChangeModeEdits } from './changeModeParser.js';
import { formatChangeModeResponse, summarizeChangeModeEdits } from './changeModeTranslator.js';
import { chunkChangeModeEdits } from './changeModeChunker.js';
import { cacheChunks, getChunks } from './chunkCache.js';

const FILE_REF_PATTERN = /@(\S+)/g;
// Inlining only: @ must start the prompt or follow whitespace, so user@host or
// a@b aren't inlined. The guard above stays broad (it must reject any traversal).
const FILE_REF_INLINE_PATTERN = /(?<=^|\s)@(\S+)/g;

// Only `*`, `**` and `?` make a token a glob. Bracket classes are deliberately
// unsupported so prose like "@list[0]" never enters the expansion path.
const GLOB_META = /[*?]/;
// Bounds on a glob token before it is compiled: see globToRegExp.
const MAX_GLOB_LENGTH = 200;
const MAX_GLOB_STARS = 6;
// Inline caps. The prompt now reaches agy on stdin, so these are about model
// context and cost, not the old Windows argv ceiling: 256 KB of any one file
// and 2 MB across the whole prompt (~500K tokens of text).
const MAX_INLINE_FILE_BYTES = 256 * 1024;
const MAX_INLINE_TOTAL_BYTES = 2 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 8 * 1024;
// Never worth sending: dependency trees, VCS internals and build output dwarf
// the source they are derived from.
const SKIP_DIR_NAMES = new Set(['node_modules', '.git', 'dist']);
const SKIP_REL_DIRS = new Set([
  path.join('docs', '.vitepress', 'cache'),
  path.join('docs', '.vitepress', 'dist')
]);
// A directory or glob expansion reads files the prompt never named, and `@.` is
// the documented headline usage, so a single untrusted token must not sweep up
// credentials the user would never have pasted — that would reopen the
// CVE-2026-0755 exfiltration primitive from inside the root. Matched on the
// resolved basename, so a benign-looking symlink to `.env` is skipped too.
// An explicitly named `@.env` is still inlined: that is the user's own choice.
const SECRET_FILE_PATTERN =
  /^(?:\.env(?:\..+)?|\.npmrc|\.netrc|\.git-credentials|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|.+\.(?:pem|key|pfx|p12))$/i;

/**
 * Rejects @file references that resolve outside the working directory.
 *
 * The Gemini CLI inlines the contents of any `@path` token it finds in the
 * prompt. Because prompt text can originate from untrusted input, an
 * unrestricted reference such as `@/etc/passwd`, `@~/.ssh/id_rsa` or
 * `@../../secret` would let that input exfiltrate arbitrary local files
 * (CVE-2026-0755). Constraining references to the project root preserves the
 * legitimate `@file` feature while removing the exfiltration primitive.
 */
export function assertSafeFileReferences(prompt: string, root: string = process.cwd()): void {
  const normalizedRoot = path.resolve(root);
  // Canonicalize the root once so a symlinked root (e.g. /tmp -> /private/tmp
  // on macOS) doesn't make legitimate in-root targets look like escapes.
  let realRoot: string;
  try {
    realRoot = realpathSync(normalizedRoot);
  } catch {
    realRoot = normalizedRoot;
  }
  const escapes = (p: string, base: string) =>
    p !== base && !p.startsWith(base + path.sep);
  for (const match of prompt.matchAll(FILE_REF_PATTERN)) {
    const ref = match[1];
    const resolved = path.resolve(normalizedRoot, ref);
    // `~` is rejected explicitly: path.resolve treats it as a literal segment,
    // so a home-directory reference would otherwise look contained.
    if (ref.startsWith('~') || escapes(resolved, normalizedRoot)) {
      throw new Error(
        `Refusing @file reference outside the project directory: "@${ref}". ` +
        `Only files within ${normalizedRoot} may be referenced.`
      );
    }
    // Symlink-aware re-check: the lexical test above cannot see through an
    // in-root symlink whose target lies outside the root. A path that doesn't
    // resolve is fine here — nothing is read, and the CLI reports it.
    let real: string | undefined;
    try {
      real = realpathSync(resolved);
    } catch {
      real = undefined;
    }
    if (real !== undefined && escapes(real, realRoot)) {
      throw new Error(
        `Refusing @file reference resolving outside the project directory: "@${ref}". ` +
        `Only files within ${normalizedRoot} may be referenced.`
      );
    }
  }
}

/**
 * Wraps a user request in the changeMode instruction template that makes the
 * model emit machine-applicable OLD/NEW edit blocks. The format is model- and
 * CLI-agnostic, so both the gemini and agy backends share this builder.
 */
export function buildChangeModePrompt(userRequest: string): string {
  return `
[CHANGEMODE INSTRUCTIONS]
You are generating code modifications that will be processed by an automated system. The output format is critical because it enables programmatic application of changes without human intervention.

INSTRUCTIONS:
1. Analyze each provided file thoroughly
2. Identify locations requiring changes based on the user request
3. For each change, output in the exact format specified
4. The OLD section must be EXACTLY what appears in the file (copy-paste exact match)
5. Provide complete, directly replacing code blocks
6. Verify line numbers are accurate

CRITICAL REQUIREMENTS:
1. Output edits in the EXACT format specified below - no deviations
2. The OLD string MUST be findable with Ctrl+F - it must be a unique, exact match
3. Include enough surrounding lines to make the OLD string unique
4. If a string appears multiple times (like </div>), include enough context lines above and below to make it unique
5. Copy the OLD content EXACTLY as it appears - including all whitespace, indentation, line breaks
6. Never use partial lines - always include complete lines from start to finish

OUTPUT FORMAT (follow exactly):
**FILE: [filename]:[line_number]**
\`\`\`
OLD:
[exact code to be replaced - must match file content precisely]
NEW:
[new code to insert - complete and functional]
\`\`\`

EXAMPLE 1 - Simple unique match:
**FILE: src/utils/helper.js:100**
\`\`\`
OLD:
function getMessage() {
  return "Hello World";
}
NEW:
function getMessage() {
  return "Hello Universe!";
}
\`\`\`

EXAMPLE 2 - Common tag needing context:
**FILE: index.html:245**
\`\`\`
OLD:
        </div>
      </div>
    </section>
NEW:
        </div>
      </footer>
    </section>
\`\`\`

IMPORTANT: The OLD section must be an EXACT copy from the file that can be found with Ctrl+F!

USER REQUEST:
${userRequest}
`;
}

/**
 * changeMode preprocessing shared by both backends: rewrite `file:foo` -> `@foo`
 * so the inlining/guard path treats them as file refs, then wrap the request in
 * the OLD/NEW template. One implementation so gemini and agy cannot drift.
 */
export function prepareChangeModePrompt(prompt: string): string {
  return buildChangeModePrompt(prompt.replace(/file:(\S+)/g, '@$1'));
}

/** Files an expansion dropped: the first few names, plus how many there were. */
interface Dropped {
  names: string[];
  count: number;
}
const DROPPED_NAMES_SHOWN = 10;

/** Running total for one inlineFileReferences call, shared by every token in it. */
interface InlineBudget {
  spent: number;
  /** Files the budget pushed out, reported at the end of the prompt. */
  omitted: Dropped;
  /** Files that exist but could not be read, likewise reported. */
  unreadable: Dropped;
}

/**
 * Records a dropped file. Only the names the footer actually prints are kept —
 * `@.` past the budget on a big repo drops thousands, and holding every name to
 * print ten of them is waste. Returns null so callers can `return drop(...)`.
 */
function drop(into: Dropped, label: string): null {
  into.count++;
  if (into.names.length < DROPPED_NAMES_SHOWN) { into.names.push(label); }
  return null;
}

/** Footer naming what was dropped and why, or '' when nothing was. */
function droppedFooter(dropped: Dropped, reason: string): string {
  if (dropped.count === 0) { return ''; }
  const rest = dropped.count > dropped.names.length
    ? `, and ${dropped.count - dropped.names.length} more`
    : '';
  return `\n----- ${reason}; ${dropped.count} file(s) not included: ${dropped.names.join(', ')}${rest} -----\n`;
}

/**
 * Compiles a glob into a RegExp over root-relative POSIX paths, or null when the
 * token is not worth compiling. Node has no built-in glob in the version range
 * this package supports and a runtime dependency is not worth `*` and `?`, so
 * this is the whole matcher.
 *
 * The bounds are a denial-of-service guard, not tidiness: the token comes from
 * untrusted prompt text and `**` compiles to `.*`, so `a**a**...ab` backtracks
 * catastrophically — measured on Node 22, 679 ms at ten `**` and roughly double
 * per further one, for EACH candidate path — which would freeze this
 * single-threaded server. A real glob is short with a handful of stars; anything
 * past that is prose and stays verbatim, the same as any other non-matching token.
 */
function globToRegExp(glob: string): RegExp | null {
  if (glob.length > MAX_GLOB_LENGTH || (glob.match(/\*/g)?.length ?? 0) > MAX_GLOB_STARS) {
    Logger.warn(`inlineFileReferences: ignoring oversized glob token "@${glob}"`);
    return null;
  }
  const source = glob.replace(
    /((?:^|\/)\*\*\/)|(\*\*)|(\*)|(\?)|([^/\w-])/g,
    (_m, slashStar: string, doubleStar: string, star: string, question: string, literal: string) => {
      // `a/**/b` matches `a/b` too, and a leading `**/` matches a root-level
      // file: that is what every glob implementation and every reader expects.
      // Miss the leading case and `@**/*.md` silently drops every root-level
      // README, handing the model a partial corpus that reads as complete.
      if (slashStar) { return slashStar[0] === '/' ? '/(?:.*/)?' : '(?:.*/)?'; }
      if (doubleStar) { return '.*'; }
      if (star) { return '[^/]*'; }
      if (question) { return '[^/]'; }
      return '\\' + literal;
    }
  );
  return new RegExp(`^${source}$`);
}

/**
 * Collects root-relative paths of the regular files under `dirReal`.
 *
 * Every entry is re-canonicalized and re-jailed: the CVE-2026-0755 guard is
 * lexical on the *token*, and an expansion walks paths the token never named,
 * so a symlink planted inside the root must be neither followed nor read.
 */
function walkFiles(dirReal: string, rootReal: string, seen: Set<string> = new Set([dirReal])): string[] {
  let entries;
  try {
    entries = readdirSync(dirReal, { withFileTypes: true });
  } catch (e) {
    Logger.warn(`inlineFileReferences: could not list ${dirReal}: ${(e as Error).message}`);
    return [];
  }
  const found: string[] = [];
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (SKIP_DIR_NAMES.has(entry.name)) { continue; }
    let real: string;
    let stats: Stats;
    try {
      real = realpathSync(path.join(dirReal, entry.name));
      stats = statSync(real);
    } catch {
      continue; // dangling symlink or a race with a delete: nothing to inline
    }
    if (real !== rootReal && !real.startsWith(rootReal + path.sep)) { continue; }
    const rel = path.relative(rootReal, real);
    if (stats.isDirectory()) {
      if (SKIP_REL_DIRS.has(rel) || seen.has(real)) { continue; }
      seen.add(real);
      found.push(...walkFiles(real, rootReal, seen));
    } else if (stats.isFile() && !SECRET_FILE_PATTERN.test(path.basename(rel))) {
      found.push(rel);
    }
  }
  return found;
}

/**
 * Renders one file as a BEGIN/END block, or null when it cannot be inlined
 * (unreadable, binary, or out of budget). Reads at most MAX_INLINE_FILE_BYTES,
 * so a multi-gigabyte file never lands in memory.
 */
function inlineOneFile(label: string, real: string, budget: InlineBudget): string | null {
  // Check the budget BEFORE touching the disk: `@.` on a large repo would
  // otherwise keep opening, reading and sniffing every remaining file long after
  // the budget was spent. The prompt was bounded; the work was not.
  if (budget.spent >= MAX_INLINE_TOTAL_BYTES) { return drop(budget.omitted, label); }
  let fd: number | undefined;
  try {
    fd = openSync(real, 'r');
    const size = fstatSync(fd).size;
    const want = Math.min(size, MAX_INLINE_FILE_BYTES);
    const buf = Buffer.alloc(want);
    const got = want > 0 ? readSync(fd, buf, 0, want, 0) : 0;
    // A NUL byte near the start is the cheap conventional binary test (git uses
    // the same one). Binaries are never useful as prompt text.
    if (buf.subarray(0, Math.min(got, BINARY_SNIFF_BYTES)).includes(0)) {
      Logger.warn(`inlineFileReferences: skipping binary file ${label}`);
      return null;
    }
    if (budget.spent + got > MAX_INLINE_TOTAL_BYTES) { return drop(budget.omitted, label); }
    budget.spent += got;
    const truncated = size > got
      ? `\n----- TRUNCATED: ${label} is ${size} bytes, only the first ${got} are shown -----`
      : '';
    return `\n----- BEGIN FILE: ${label} -----\n${buf.subarray(0, got).toString('utf8')}${truncated}\n----- END FILE: ${label} -----\n`;
  } catch (e) {
    // EVERY failure degrades to a skip, reads included: an entry the walk saw as
    // a file and that is now a directory (EISDIR), an EACCES, or an unhydrated
    // OneDrive placeholder must drop one file, not abort the whole tool call.
    // It lands in the footer, so a dropped file is visible in the prompt too.
    Logger.warn(`inlineFileReferences: could not read ${label}: ${(e as Error).message}`);
    return drop(budget.unreadable, label);
  } finally {
    if (fd !== undefined) { closeSync(fd); }
  }
}

/**
 * Replaces every in-project `@path` reference with file contents inlined in
 * delimited blocks. The Gemini CLI does this inlining itself; the agy backend
 * does NOT reliably inline `@file` (it is agent-first and decides to read files
 * via its own tools), so for agy we inline ourselves to keep both determinism
 * and the CVE-2026-0755 project-root guard in the data path.
 *
 * A token is inlined only when it names something that exists: a file, a
 * directory (`@.` is the whole project), or a glob with matches. Anything else
 * is left exactly as written, because `@param`, `@Injectable()` and
 * `@types/node` are prose, not file references, and every one of them used to
 * be replaced by a "FILE NOT FOUND" marker.
 */
export function inlineFileReferences(prompt: string, root: string = process.cwd()): string {
  // Reuse the same guard the gemini path relies on; rejects ~, absolute,
  // traversal and out-of-root-symlink references before we read anything.
  assertSafeFileReferences(prompt, root);
  const normalizedRoot = path.resolve(root);
  // Compare real targets against the canonicalized root (see the note in
  // assertSafeFileReferences about symlinked roots).
  let realRoot: string;
  try {
    realRoot = realpathSync(normalizedRoot);
  } catch {
    realRoot = normalizedRoot;
  }
  const escapesRoot = (p: string) =>
    p !== realRoot && !p.startsWith(realRoot + path.sep);
  const budget: InlineBudget = {
    spent: 0,
    omitted: { names: [], count: 0 },
    unreadable: { names: [], count: 0 }
  };
  let wholeTree: string[] | undefined; // walked at most once per prompt

  const expand = (rels: string[]): string | null => {
    const blocks = rels
      .map(rel => inlineOneFile(rel.split(path.sep).join('/'), path.join(realRoot, rel), budget))
      .filter((block): block is string => block !== null);
    return blocks.length > 0 ? blocks.join('') : null;
  };

  const inlined = prompt.replace(FILE_REF_INLINE_PATTERN, (whole, ref: string) => {
    if (GLOB_META.test(ref)) {
      const pattern = globToRegExp(ref.split('\\').join('/'));
      if (pattern === null) { return whole; }
      wholeTree ??= walkFiles(realRoot, realRoot);
      return expand(wholeTree.filter(rel => pattern.test(rel.split(path.sep).join('/')))) ?? whole;
    }
    const resolved = path.resolve(normalizedRoot, ref);
    // Symlink-aware guard: assertSafeFileReferences is lexical (path.resolve),
    // so an in-root symlink could still point outside the root. Resolve the real
    // target and re-check before reading. realpathSync throws on a missing path —
    // that token is simply not a file reference, so it stays verbatim.
    let real: string;
    let stats: Stats;
    try {
      real = realpathSync(resolved);
      stats = statSync(real);
    } catch {
      return whole;
    }
    if (escapesRoot(real)) {
      throw new Error(
        `Refusing @file reference resolving outside the project directory: "@${ref}". ` +
        `Only files within ${normalizedRoot} may be referenced.`
      );
    }
    if (stats.isDirectory()) {
      return expand(
        real === realRoot ? (wholeTree ??= walkFiles(realRoot, realRoot)) : walkFiles(real, realRoot)
      ) ?? whole;
    }
    if (!stats.isFile()) { return whole; }
    return inlineOneFile(ref, real, budget) ?? whole;
  });

  // Say what was dropped. Silent truncation reads to the model as full coverage,
  // which is worse than a smaller answer.
  return inlined +
    droppedFooter(budget.omitted, `OMITTED: the ${MAX_INLINE_TOTAL_BYTES} byte inline budget was reached`) +
    droppedFooter(budget.unreadable, 'UNREADABLE: files exist but could not be read');
}

export async function executeGeminiCLI(
  prompt: string,
  model?: string,
  sandbox?: boolean,
  changeMode?: boolean,
  onProgress?: (newOutput: string) => void
): Promise<string> {
  let prompt_processed = prompt;

  if (changeMode) {
    prompt_processed = prepareChangeModePrompt(prompt);
  }

  // Block @file references that escape the project root before the prompt
  // reaches the Gemini CLI's file-inlining parser (CVE-2026-0755).
  assertSafeFileReferences(prompt_processed);

  // changeMode and @file prompts go on stdin instead of the -p flag: this dodges
  // cmd.exe argument parsing on Windows and the OS command-line length limit that
  // large @file/changeMode prompts can exceed. Simple prompts still use -p. (#27, #77)
  const useStdin = !!changeMode || prompt_processed.includes('@');

  const args = [];
  if (model) { args.push(CLI.FLAGS.MODEL, model); }
  if (sandbox) { args.push(CLI.FLAGS.SANDBOX); }

  // cmd.exe-safe quoting on Windows is handled in commandExecutor, so the prompt
  // is passed verbatim as one logical CLI argument. No manual quoting here —
  // wrapping in `"` only injects literal quote characters and corrupts @file
  // references (#66, CVE-2026-0755).
  if (!useStdin) { args.push(CLI.FLAGS.PROMPT, prompt_processed); }

  try {
    return await executeCommand(CLI.COMMANDS.GEMINI, args, onProgress, useStdin ? prompt_processed : undefined);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes(ERROR_MESSAGES.QUOTA_EXCEEDED) && model !== MODELS.FLASH) {
      Logger.warn(`${ERROR_MESSAGES.QUOTA_EXCEEDED}. Falling back to ${MODELS.FLASH}.`);
      await sendStatusMessage(STATUS_MESSAGES.FLASH_RETRY);
      const fallbackArgs = [];
      fallbackArgs.push(CLI.FLAGS.MODEL, MODELS.FLASH);
      if (sandbox) {
        fallbackArgs.push(CLI.FLAGS.SANDBOX);
      }

      // Pass the prompt verbatim here too (see note in the primary path).
      if (!useStdin) { fallbackArgs.push(CLI.FLAGS.PROMPT, prompt_processed); }
      try {
        const result = await executeCommand(CLI.COMMANDS.GEMINI, fallbackArgs, onProgress, useStdin ? prompt_processed : undefined);
        Logger.warn(`Successfully executed with ${MODELS.FLASH} fallback.`);
        await sendStatusMessage(STATUS_MESSAGES.FLASH_SUCCESS);
        return result;
      } catch (fallbackError) {
        const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(`${MODELS.PRO} quota exceeded, ${MODELS.FLASH} fallback also failed: ${fallbackErrorMessage}`);
      }
    } else {
      throw error;
    }
  }
}

export async function processChangeModeOutput(
  rawResult: string,
  chunkIndex?: number,
  chunkCacheKey?: string,
  prompt?: string
): Promise<string> {
  // Check for cached chunks first
  if (chunkIndex && chunkCacheKey) {
    const cachedChunks = getChunks(chunkCacheKey);
    if (cachedChunks && chunkIndex > 0 && chunkIndex <= cachedChunks.length) {
      Logger.debug(`Using cached chunk ${chunkIndex} of ${cachedChunks.length}`);
      const chunk = cachedChunks[chunkIndex - 1];
      let result = formatChangeModeResponse(
        chunk.edits,
        { current: chunkIndex, total: cachedChunks.length, cacheKey: chunkCacheKey }
      );

      // Add summary for first chunk only
      if (chunkIndex === 1 && chunk.edits.length > 5) {
        const allEdits = cachedChunks.flatMap(c => c.edits);
        result = summarizeChangeModeEdits(allEdits) + '\n\n' + result;
      }

      return result;
    }

    if (!rawResult.trim()) {
      if (cachedChunks) {
        return `❌ Invalid chunk index: ${chunkIndex}

Available chunks: 1 to ${cachedChunks.length}
You requested: ${chunkIndex}

Please use a valid chunk index.`;
      }

      return `❌ Cache miss: No chunks found for cache key "${chunkCacheKey}".

Possible reasons:
1. The cache key is incorrect, or the original changeMode request did not create chunks
2. The cache has expired (10 minute TTL)
3. The MCP server was restarted and the file-based cache was cleared

Please re-run the original changeMode request to regenerate the chunks.`;
    }

    Logger.debug(`Cache miss or invalid chunk index, processing new result`);
  }

  // Parse OLD/NEW format
  const edits = parseChangeModeOutput(rawResult);

  if (edits.length === 0) {
    return `No edits found in Gemini's response. Please ensure Gemini uses the OLD/NEW format. \n\n${rawResult}`;
  }

  // Validate edits
  const validation = validateChangeModeEdits(edits);
  if (!validation.valid) {
    return `Edit validation failed:\n${validation.errors.join('\n')}`;
  }

  const chunks = chunkChangeModeEdits(edits);

  // Cache if multiple chunks and we have the original prompt
  let cacheKey: string | undefined;
  if (chunks.length > 1 && prompt) {
    cacheKey = cacheChunks(prompt, chunks);
    Logger.debug(`Cached ${chunks.length} chunks with key: ${cacheKey}`);
  }

  // Return requested chunk or first chunk
  const returnChunkIndex = (chunkIndex && chunkIndex > 0 && chunkIndex <= chunks.length) ? chunkIndex : 1;
  const returnChunk = chunks[returnChunkIndex - 1];

  // Format the response
  let result = formatChangeModeResponse(
    returnChunk.edits,
    chunks.length > 1 ? { current: returnChunkIndex, total: chunks.length, cacheKey } : undefined
  );

  // Add summary if helpful (only for first chunk)
  if (returnChunkIndex === 1 && edits.length > 5) {
    result = summarizeChangeModeEdits(edits, chunks.length > 1) + '\n\n' + result;
  }

  Logger.debug(`ChangeMode: Parsed ${edits.length} edits, ${chunks.length} chunks, returning chunk ${returnChunkIndex}`);
  return result;
}

// Placeholder
async function sendStatusMessage(message: string): Promise<void> {
  Logger.debug(`Status: ${message}`);
}
