# Prettier SOP setup (formatting toolchain)

**Goal:** Standardize code structure across the frontend with Prettier + an
auto-format pre-commit hook, fixing existing inconsistency (e.g. `MainApp.tsx`
used tabs while the rest used spaces).

## Key changes

- Added dev deps (Bun): `prettier@3`, `prettier-plugin-tailwindcss@0.8`,
  `husky@9`, `lint-staged@17`.
- `.prettierrc.json`: printWidth 100, tabWidth 2, no tabs, semi, singleQuote,
  trailingComma `all`, plugin `prettier-plugin-tailwindcss`, and
  `tailwindStylesheet: ./src/styles/app.css` (required for Tailwind v4 — no
  config file exists, so the plugin needs the CSS entry point to read the theme).
- `.prettierignore`: skips `node_modules`, `dist`, `src-tauri/{target,gen}`,
  lockfiles/logs.
- `.editorconfig`: 2-space, UTF-8, LF, final newline (Rust = 4-space).
- `.gitattributes`: `* text=auto eol=lf` + binary assets — stops the Windows
  CRLF↔LF churn that would otherwise make `format:check` perpetually fail.
- `package.json` scripts: `format` (`prettier --write .`),
  `format:check` (`prettier --check .`), `prepare` (`husky`).
- `lint-staged`: `*.{ts,tsx,js,jsx,json,jsonc,css,md,html}` → `prettier --write`.
- `.husky/pre-commit`: `bunx lint-staged` (replaced husky's default `bun test`,
  since no test framework is configured).

## Decisions

- 2-space + single quote chosen to match the existing majority style; only the
  tab-indented files were normalized.
- Tailwind class sorting enabled — fits the utility-first, inline-className UI.
- One-time `bun run format` normalized the whole tracked codebase.
- **Multi-agent care:** another agent was mid-flight on a hugeicons integration
  (`src/windows/main/Titlebar.tsx`, untracked `src/lib/icons.ts`). Those two
  files were excluded from the format pass; the pre-commit hook will format them
  automatically when that agent commits. Their `@hugeicons/*` deps in
  `package.json`/`bun.lock` rode along in the tooling commit (content preserved).
- Out of scope: Rust formatting (`src-tauri/`) — that's `rustfmt`, not Prettier.

## Verification

- `bun run build` (tsc + vite build) — passed (75 modules, no type errors).
- Pre-commit hook exercised on both commits — lint-staged ran Prettier cleanly.

## Commits

1. `chore(format): set up Prettier, EditorConfig, Husky and lint-staged`
2. `style: format entire codebase with Prettier` (33 files)
3. this doc.
