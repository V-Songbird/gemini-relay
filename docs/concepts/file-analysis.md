# Context Inlining

An `@` reference in a prompt sends that file's contents to Gemini. Your agent never opens the file, so a whole subtree can go out for one paragraph back.

On the default `agy` backend the relay resolves those references itself, before the prompt is sent. This page says what each kind of token resolves to, what gets skipped on the way, how much fits, and what the prompt tells you when something was dropped.

## Basic usage

Any `ask-gemini` prompt can carry references. The `@` must start the prompt or follow whitespace, so `user@host` and `name@example.com` are never mistaken for files.

```json
{
  "name": "ask-gemini",
  "arguments": { "prompt": "@src/index.ts explain what this does" }
}
```

In practice you ask in plain language and your agent makes that call:

```
Ask gemini to explain @src/index.ts. Use flash.
```

## Multiple files

Reference as many as you like in one prompt:

```json
{
  "name": "ask-gemini",
  "arguments": { "prompt": "@src/backends/agy.ts @src/backends/gemini.ts how do these two differ?" }
}
```

## Directories and globs

What a token resolves to decides what happens to it:

- **A file** — inlined, unless one of the skips or budgets below drops it.
- **A directory** — every regular file beneath it, recursively. `@.` is the whole project.
- **A glob** — expanded to its matches. Only `*`, `**` and `?` make a token a glob, so prose like `@list[0]` never enters the expansion path.
- **Anything else** — left in the prompt exactly as written. `@param`, `@Injectable()` and `@types/node` reach the model verbatim instead of being replaced by a "file not found" marker.

```
analyze @src/ and list the top 3 optimizations
```

```
@**/*.test.ts summarize what these tests cover
```

## What gets skipped

Two filters run, at two different scopes.

**Expansion skips** reach directory and glob tokens only — the files your prompt never named. `node_modules`, `.git` and `dist` go by name at any depth, plus `docs/.vitepress/cache` and `docs/.vitepress/dist`. So do secret-looking files: `.env` and friends, SSH private keys, certificates and credential files. The exact pattern is in the block below.

A symlink is judged by what it points at, so a benign-looking link to a secret is skipped too.

A file you name directly is not covered by that skip. `@.env` is not filtered out for being a secret — that is your own choice, not a token sweeping it up — and it means the file's contents are sent to Gemini in the prompt like any other file. It can still be dropped for being binary, unreadable or over budget, like any other file too.

**The binary sniff** is done by the inliner rather than the walk, so it reaches every file, including one you named explicitly. A file whose first 8 KB contains a NUL byte is dropped, and nothing in the prompt says so: no footer, no marker, only a server-side log line. The token is left as written, so `@logo.png` reaches the model as prose rather than as a file.

## Budgets and the OMITTED marker

Two caps bound what one prompt can carry. They are about model context and cost, not about command-line length — on a current agy the prompt travels on stdin, so `spawn ENAMETOOLONG` is no longer how a large `@file` prompt ends.

| Cap | Value |
| :--- | :--- |
| Bytes read from any one file | 256 KB |
| Bytes inlined across the whole prompt | 2 MB |

Each file arrives between markers naming it:

```
----- BEGIN FILE: src/index.ts -----
…contents…
----- END FILE: src/index.ts -----
```

Truncation, the byte budget and unreadable files are all reported in the prompt, because silent truncation reads to the model as full coverage:

- A file longer than the per-file cap gets `----- TRUNCATED: <label> is <n> bytes, only the first <m> are shown -----` inside its block.
- Files pushed out by the 2 MB prompt budget are listed in a footer: `----- OMITTED: the 2097152 byte inline budget was reached; N file(s) not included: … -----`.
- Files that exist but could not be read (permissions, a placeholder that never hydrated, a race with a delete) get their own footer: `----- UNREADABLE: files exist but could not be read; N file(s) not included: … -----`.

Each footer names up to ten files and then says how many more there were. A binary file is the one drop with no marker of any kind — it never reaches either footer, so a binary reference contributes nothing and says nothing.

## The project-root jail

Prompt text can come from untrusted input, so an unrestricted reference would be an exfiltration primitive (CVE-2026-0755). Every `@` token in the prompt — not just the ones that get inlined — is checked before anything is read:

- A token starting with `~` is rejected outright.
- A token resolving outside the project root is rejected: `Refusing @file reference outside the project directory: "@../secret".`
- The resolved path is then canonicalized and re-checked, so an in-root symlink pointing outside the root is rejected too.
- Directory and glob expansion re-canonicalizes and re-jails every entry it walks, because those paths were never named by the token.

A rejected reference fails the whole tool call. Keep paths relative to the project root, and use `addDirs` when Gemini genuinely needs another directory in scope.

<details>
<summary><strong>For AI agents — who inlines, the glob limits, the skip patterns</strong></summary>

**Who does the inlining.** On the `agy` backend, the relay does, in `inlineFileReferences` (`src/utils/geminiExecutor.ts`): agy is agent-first and decides on its own whether to open a file, so the relay resolves the references up front to keep the result deterministic and to keep the project-root guard in the data path. On the legacy `gemini` backend the Gemini CLI inlines its own `@` tokens and the relay only enforces the guard.

**Glob limits.** Only `*`, `**` and `?` make a token a glob; bracket classes are deliberately unsupported. Patterns match root-relative POSIX paths, `a/**/b` also matches `a/b`, and a leading `**/` matches root-level files. A glob over 200 characters, or with more than six `*` characters, is left alone — `**` compiles to `.*`, and a token from untrusted prompt text could otherwise backtrack catastrophically against every candidate path.

**The secret pattern**, matched case-insensitively on the resolved basename during expansion only: `.env` and `.env.*`, `.npmrc`, `.netrc`, `.git-credentials`, `id_rsa` / `id_dsa` / `id_ecdsa` / `id_ed25519` and their `.pub` counterparts, and anything ending `.pem`, `.key`, `.pfx` or `.p12`.

**The walk.** Symlinked directories are followed only once, so a cycle inside the project cannot loop the walk. Entries are read in name order.

**Prompt delivery.** When the installed agy advertises `--input-format stream-json`, the prompt reaches it on stdin as one stream-json message and no command-line length limit applies. An older build falls back to `-p <prompt>` and is still bounded by the OS argv cap — and so does a build whose `agy --help` probe timed out, because every capability defaults to false. See [How It Works](/concepts/how-it-works).

</details>
