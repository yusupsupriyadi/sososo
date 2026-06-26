# 2026-06-26 — CI: ignore low esbuild advisory in `bun audit`

**Scope:** Fixed the red `Security audit` job on CI (surfaced on PR #12). The
failure was unrelated to PR #12 — it touches no dependency files.

**Root cause:**

- `bun audit` flagged GHSA-g7r4-m6w7-qqqr (LOW): esbuild arbitrary file read via
  the dev server on Windows. `esbuild@0.27.7` is pulled transitively by
  `vite@7.3.5` (`esbuild: ^0.27.0`).
- Patched esbuild is `>=0.28.1`, outside vite's `^0.27.0` range → not reachable
  by `bun update`; needs a future vite bump.
- Surfaced now because CI's bun (1.3.14, unpinned `oven-sh/setup-bun@v2`) exits 1
  on any advisory; local bun 1.3.10 exited 0 for the same finding.
- No production impact: the shipped Tauri app never runs the vite dev server.

**Files affected:**

- `.github/workflows/ci.yml`: `bun audit` → `bun audit --ignore GHSA-g7r4-m6w7-qqqr`
  with an explanatory comment (mirrors the existing `cargo audit --ignore`).

**Key decision:** Surgical `--ignore` over `--audit-level=moderate` so every
_other_ (incl. future low) advisory still fails the gate.

**Next steps:** Remove the `--ignore` when vite ships a release pulling esbuild
`>=0.28.1`, then `bun update`. PR branches opened before this commit must merge/
rebase master (or use GitHub "Update branch") to pick up the fixed workflow.
