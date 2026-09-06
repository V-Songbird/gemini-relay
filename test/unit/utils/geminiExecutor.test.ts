import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertSafeFileReferences,
  buildChangeModePrompt,
  inlineFileReferences,
  prepareChangeModePrompt,
} from "../../../src/utils/geminiExecutor.js";

const root = process.cwd();

/** Canonicalized so the guard's realpath comparisons line up (macOS /var, Windows 8.3). */
function tempRoot(prefix: string): string {
  return realpathSync(mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function seed(dir: string, files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    const target = path.join(dir, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
}

describe("Node Utilities: Gemini CLI Executor", () => {
  test("assertSafeFileReferences allows in-project @file references", () => {
    assert.doesNotThrow(() => assertSafeFileReferences("explain @src/index.ts", root));
    assert.doesNotThrow(() => assertSafeFileReferences("no references at all", root));
    assert.doesNotThrow(() => assertSafeFileReferences("@package.json summarise", root));
  });

  test("assertSafeFileReferences rejects traversal, home, and absolute references", () => {
    assert.throws(() => assertSafeFileReferences("@../secret.txt", root), /outside the project directory/);
    assert.throws(() => assertSafeFileReferences("@~/.ssh/id_rsa", root), /outside the project directory/);
    assert.throws(() => assertSafeFileReferences("@/etc/passwd", root), /outside the project directory/);
  });

  test("buildChangeModePrompt wraps the request in the OLD/NEW template", () => {
    const out = buildChangeModePrompt("do the thing");
    assert.match(out, /\[CHANGEMODE INSTRUCTIONS\]/);
    assert.match(out, /USER REQUEST:\ndo the thing/);
  });

  test("prepareChangeModePrompt rewrites file: refs to @ refs before wrapping", () => {
    const out = prepareChangeModePrompt("update file:src/index.ts please");
    assert.match(out, /\[CHANGEMODE INSTRUCTIONS\]/);
    assert.match(out, /@src\/index\.ts/);
    assert.doesNotMatch(out, /file:src\/index\.ts/);
  });

  test(
    "assertSafeFileReferences blocks an in-root symlink whose target escapes the root",
    { skip: process.platform === "win32" }, // symlink creation needs privileges on Windows
    () => {
      const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "gem-root-")));
      const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), "gem-secret-")));
      try {
        const secret = path.join(outside, "secret.txt");
        writeFileSync(secret, "TOPSECRET");
        symlinkSync(secret, path.join(dir, "link.txt"));
        // Lexically in-root, but resolves outside — the gemini CLI would inline
        // it, so the guard itself must refuse (CVE-2026-0755).
        assert.throws(
          () => assertSafeFileReferences("read @link.txt", dir),
          /outside the project directory/,
        );
        // A regular in-root file is still fine.
        writeFileSync(path.join(dir, "ok.txt"), "fine");
        assert.doesNotThrow(() => assertSafeFileReferences("read @ok.txt", dir));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
      }
    },
  );

  test("inlineFileReferences replaces in-project refs with file contents", () => {
    const out = inlineFileReferences("see @package.json", root);
    assert.match(out, /BEGIN FILE: package\.json/);
    assert.match(out, /gemini-relay/);
    assert.doesNotMatch(out, /@package\.json/);
  });

  test("inlineFileReferences enforces the same project-root guard before reading", () => {
    assert.throws(() => inlineFileReferences("@/etc/passwd", root), /outside the project directory/);
  });

  // Contract change (audit bug 4): a token that names nothing is NOT a file
  // reference, so it is left exactly as written. The old "FILE NOT FOUND"
  // marker mangled JSDoc tags, decorators and npm scopes.
  test("inlineFileReferences leaves an @token that resolves to nothing verbatim", () => {
    for (const prompt of [
      "@does-not-exist.txt",
      "/** @param x the value */",
      "class A { @Injectable() svc }",
      "install @types/node",
    ]) {
      const out = inlineFileReferences(prompt, root);
      assert.equal(out, prompt);
      assert.doesNotMatch(out, /FILE NOT FOUND/);
    }
  });

  test("inlineFileReferences expands a directory reference to its text files", () => {
    const dir = tempRoot("gem-dir-");
    try {
      seed(dir, { "a.ts": "export const a = 1;", "nested/b.md": "# b" });
      const out = inlineFileReferences("review @.", dir);
      assert.match(out, /BEGIN FILE: a\.ts/);
      assert.match(out, /export const a = 1;/);
      assert.match(out, /BEGIN FILE: nested\/b\.md/); // labelled relative to root
      assert.match(out, /# b/);
      assert.doesNotMatch(out, /@\./);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("inlineFileReferences skips dependency, VCS, build and binary files when expanding", () => {
    const dir = tempRoot("gem-skip-");
    try {
      seed(dir, {
        "keep.ts": "keepme",
        "node_modules/dep/index.js": "depcode",
        ".git/config": "gitconfig",
        "dist/out.js": "builtcode",
        "docs/.vitepress/cache/x.json": "cached",
        "docs/.vitepress/config.ts": "vpconfig",
        "logo.png": "PNG\u0000\u0000binaryblob",
      });
      const out = inlineFileReferences("@.", dir);
      assert.match(out, /keepme/);
      assert.match(out, /vpconfig/);
      for (const excluded of ["depcode", "gitconfig", "builtcode", "cached", "binaryblob"]) {
        assert.doesNotMatch(out, new RegExp(excluded));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("inlineFileReferences expands a subdirectory reference", () => {
    const dir = tempRoot("gem-sub-");
    try {
      seed(dir, { "src/a.ts": "insrc", "other.txt": "outside-src" });
      const out = inlineFileReferences("look at @src", dir);
      assert.match(out, /BEGIN FILE: src\/a\.ts/);
      assert.match(out, /insrc/);
      assert.doesNotMatch(out, /outside-src/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("inlineFileReferences expands globs and leaves non-matching globs verbatim", () => {
    const dir = tempRoot("gem-glob-");
    try {
      seed(dir, { "src/a.ts": "aaa", "src/deep/b.ts": "bbb", "src/c.js": "ccc" });
      const out = inlineFileReferences("glob @src/**/*.ts", dir);
      assert.match(out, /BEGIN FILE: src\/a\.ts/); // `/**/` also matches zero dirs
      assert.match(out, /BEGIN FILE: src\/deep\/b\.ts/);
      assert.doesNotMatch(out, /ccc/);
      assert.equal(inlineFileReferences("glob @src/*.rs", dir), "glob @src/*.rs");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // A leading `**/` used to compile to `^.*\/...$`, which requires a directory
  // separator, so `@**/*.md` silently dropped every root-level README.
  test("inlineFileReferences expands a leading **/ glob including root-level files", () => {
    const dir = tempRoot("gem-glob-lead-");
    try {
      seed(dir, { "a.ts": "rootlevel", "src/deep/b.ts": "nested", "c.md": "notes" });
      const out = inlineFileReferences("glob @**/*.ts", dir);
      assert.match(out, /BEGIN FILE: a\.ts/);
      assert.match(out, /rootlevel/);
      assert.match(out, /BEGIN FILE: src\/deep\/b\.ts/);
      assert.doesNotMatch(out, /notes/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // `**` compiles to `.*`, so a token with many of them backtracks
  // catastrophically (seconds per candidate path) and would freeze the server.
  test("inlineFileReferences leaves a pathological glob verbatim instead of compiling it", () => {
    const dir = tempRoot("gem-redos-");
    try {
      seed(dir, { "a.ts": "aaa", "src/deep/b.ts": "bbb" });
      const prompt = `glob @${"a**".repeat(20)}ab`;
      const started = Date.now();
      assert.equal(inlineFileReferences(prompt, dir), prompt);
      assert.ok(Date.now() - started < 1000, "an oversized glob must be rejected, not matched");
      // A long token with few stars is still compiled and still finds nothing.
      const longish = `glob @${"x".repeat(250)}/*.ts`;
      assert.equal(inlineFileReferences(longish, dir), longish);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // `@.` is the documented headline usage and prompt text can be untrusted, so
  // an expansion must never sweep up credentials (CVE-2026-0755's threat model).
  test("inlineFileReferences never sweeps credential files into an expansion", () => {
    const dir = tempRoot("gem-secret-");
    try {
      seed(dir, {
        "app.ts": "appcode",
        ".env": "API_KEY=LEAKED1",
        ".env.production": "TOKEN=LEAKED2",
        ".npmrc": "//registry:_authToken=LEAKED3",
        ".netrc": "password LEAKED4",
        "certs/server.pem": "-----BEGIN PRIVATE KEY-----LEAKED5",
        "certs/tls.key": "LEAKED6",
        "keys/id_rsa": "LEAKED7",
      });
      for (const prompt of ["@.", "@certs", "@**/*"]) {
        const out = inlineFileReferences(prompt, dir);
        assert.doesNotMatch(out, /LEAKED/, `${prompt} leaked a credential file`);
      }
      assert.match(inlineFileReferences("@.", dir), /appcode/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("inlineFileReferences truncates a file past the per-file cap and says so", () => {
    const dir = tempRoot("gem-big-");
    try {
      const size = 256 * 1024 + 100;
      seed(dir, { "big.txt": "x".repeat(size) });
      const out = inlineFileReferences("@big.txt", dir);
      assert.match(out, new RegExp(`TRUNCATED: big\\.txt is ${size} bytes, only the first 262144 are shown`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("inlineFileReferences stops at the overall inline budget and names what it dropped", () => {
    const dir = tempRoot("gem-budget-");
    try {
      // Nine 256 KB files: eight fill the 2 MB budget exactly, the ninth cannot.
      const files: Record<string, string> = {};
      for (let i = 0; i < 9; i++) { files[`f${i}.txt`] = "x".repeat(256 * 1024); }
      seed(dir, files);
      const out = inlineFileReferences("@.", dir);
      assert.match(out, /OMITTED: the 2097152 byte inline budget was reached; 1 file\(s\) not included: f8\.txt/);
      assert.match(out, /BEGIN FILE: f0\.txt/);
      assert.doesNotMatch(out, /BEGIN FILE: f8\.txt/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test(
    "inlineFileReferences skips a file it cannot read instead of aborting, and says so",
    // chmod is a no-op on Windows and root ignores the mode bits.
    { skip: process.platform === "win32" || process.getuid?.() === 0 },
    () => {
      const dir = tempRoot("gem-unreadable-");
      try {
        seed(dir, { "ok.txt": "readable", "locked.txt": "unreachable" });
        chmodSync(path.join(dir, "locked.txt"), 0o000);
        const out = inlineFileReferences("@.", dir);
        assert.match(out, /readable/);
        assert.doesNotMatch(out, /unreachable/);
        // A dropped file must be visible in the prompt, not only on stderr.
        assert.match(out, /UNREADABLE: files exist but could not be read; 1 file\(s\) not included: locked\.txt/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  test(
    "inlineFileReferences never expands through a symlink that escapes the root",
    { skip: process.platform === "win32" }, // symlink creation needs privileges on Windows
    () => {
      const dir = tempRoot("gem-expand-");
      const outside = tempRoot("gem-outside-");
      try {
        writeFileSync(path.join(outside, "secret.txt"), "TOPSECRET");
        seed(dir, { "inside/real.txt": "harmless" });
        symlinkSync(path.join(outside, "secret.txt"), path.join(dir, "inside", "link.txt"));
        symlinkSync(outside, path.join(dir, "inside", "linkdir"));
        for (const prompt of ["@inside", "@.", "@inside/*.txt"]) {
          const out = inlineFileReferences(prompt, dir);
          assert.doesNotMatch(out, /TOPSECRET/, `${prompt} leaked through the symlink`);
        }
        assert.match(inlineFileReferences("@inside", dir), /harmless/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
      }
    },
  );

  test(
    "inlineFileReferences blocks an in-root symlink whose target escapes the root",
    { skip: process.platform === "win32" }, // symlink creation needs privileges on Windows
    () => {
      // realpath the temp roots so the guard's lexical normalizedRoot matches
      // the symlink target's canonical path (macOS /var -> /private/var).
      const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "agy-root-")));
      const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), "agy-secret-")));
      try {
        const secret = path.join(outside, "secret.txt");
        writeFileSync(secret, "TOPSECRET");
        symlinkSync(secret, path.join(dir, "link.txt"));
        // Lexically in-root, but resolves outside — must be refused, not inlined.
        assert.throws(
          () => inlineFileReferences("read @link.txt", dir),
          /outside the project directory/,
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
      }
    },
  );
});

