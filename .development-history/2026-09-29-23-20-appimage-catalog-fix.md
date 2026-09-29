# Fix Linux AppImage for the AppImage catalog (appimage.github.io#7092)

## Summary

The catalog test failed with `FATAL: .DirIcon is missing`: Tauri CLI 2.11.2 wrote `.DirIcon` as an
absolute symlink to the CI build dir. Past that, the AppImage (built on ubuntu-latest = 24.04) needs
GLIBC_2.38+ and exits immediately on the catalog's ubuntu-22.04 runner.

## Changes

- `package.json`, `bun.lock`: `@tauri-apps/cli` 2.11.2 -> 2.12.0 (relative `.DirIcon`/`.desktop` symlinks, tauri#15596).
- `.github/workflows/release.yml`: Linux leg `ubuntu-latest` -> `ubuntu-22.04` (glibc 2.35 baseline).
- `docs/build-and-release.md`, `CHANGELOG.md` (Unreleased/Fixed): document both.

## Decisions

- Kept the `sososo_linux_amd64.AppImage` asset name: the catalog only warns about "linux" in the name, and README, website and tests link to it.
- Only the CLI was bumped; the `tauri` crate stays on 2.11.2.

## Verification

- Docker ubuntu:22.04 build (`tauri build --bundles appimage`): OK, 94 MiB.
- Replayed catalog `worker.sh` checks in ubuntu:22.04 (appdir-lint, check-name, check-libc, Xvfb run, screenshot + check-screenshot): old v0.9.1 FAIL (`.DirIcon`, then `GLIBC_2.38 not found`); new build PASS, Glibc-Required=GLIBC_2.35, real UI in screenshot.
- `bun install --frozen-lockfile` OK; prettier OK on changed files.

## Limitations

- Test ran on an extracted AppImage, not a FUSE mount + firejail as in the real runner.
- master CI was already red before this change (README prettier, new dev-dependency advisories, commitlint on web commits).

## Follow-up

- Release v0.9.2 from this change, then comment `/retest` on appimage.github.io#7092.
