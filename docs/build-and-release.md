# Build & release

How to produce installers locally, what CI checks, and how a release is cut.

## Building locally

```sh
bun run tauri build
```

This runs `beforeBuildCommand` (`bun run build` — typecheck + Vite build into
`../dist`), then compiles the Rust app and bundles it. Output lands in
`src-tauri/target/release/bundle/`. The bundle is configured in
[`tauri.conf.json`](../src-tauri/tauri.conf.json) (`bundle.targets: "all"`), so
you get your platform's native artifacts:

- **Windows** → NSIS `.exe` and/or MSI installer.
- **macOS** → `.app` and `.dmg` (universal in CI; see below).
- **Linux** → `.deb`, `.AppImage`, and/or `.rpm` (needs the WebKitGTK + libpulse
  dev libraries installed; see [Development](./development.md)).

Bundle metadata: identifier `com.yusup.sososo`, publisher "Yusup Supriyadi",
category "Productivity", icons from `src-tauri/icons/`.

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on push/PR to
`master`, on a **matrix of `windows-latest` + `macos-latest` + `ubuntu-latest`**
(cancel-in-progress per ref). Each job:

1. Setup Bun, `bun install --frozen-lockfile`.
2. **Prettier check** — `bun run format:check`.
3. Setup Rust (stable + `rustfmt`, `clippy`) with `Swatinem/rust-cache`.
4. **rustfmt check** — `cargo fmt … -- --check`.
5. **Typecheck + build frontend** — `bun run build` (also produces `../dist`,
   which `tauri::generate_context!` embeds, so it must run before clippy).
6. **Clippy** — `cargo clippy --all-targets`.

> Why all three OSes: the audio backends are `cfg`-gated (WASAPI on Windows, cpal /
> CoreAudio on macOS, libpulse on Linux), so each **only compiles on its own OS**.
> Running clippy on macOS and Linux is how those backends are verified — they can't
> be cross-compiled from Windows. The Linux job first installs the WebKitGTK +
> libpulse dev packages. Keep all three green.

## Cutting a release

[`.github/workflows/release.yml`](../.github/workflows/release.yml) is triggered
by pushing a **`v*` tag** (or manual `workflow_dispatch`):

```sh
git tag v0.2.1
git push origin v0.2.1
```

On the same Windows + macOS + Linux matrix it uses `tauri-apps/tauri-action` to
build and attach artifacts to a **draft GitHub Release** — review it and click
**Publish**.

- macOS builds a **universal** binary (`--target universal-apple-darwin`; the
  workflow adds the `aarch64`/`x86_64` rustup targets) so the `.dmg` runs on both
  Apple Silicon and Intel.
- Linux builds `.deb` / `.AppImage` / `.rpm` on `ubuntu-22.04` (not
  `ubuntu-latest`) after installing the WebKitGTK + libpulse dev packages. The
  AppImage links against the host's glibc, so it only runs on systems at least
  as new as the build machine; 22.04 (glibc 2.35) keeps Ubuntu 22.04 and Debian 12
  supported. Tauri CLI ≥ 2.12 is required so the AppImage's `.DirIcon` is a
  relative symlink (older CLIs point it at the CI build path, which breaks the
  AppImage catalog's lint).
- `workflow_dispatch` (no tag) builds the artifacts **without** creating a
  release.

> **Updater signing is configured** (minisign keys — see [Auto-update](#auto-update)),
> so in-app updates are verified. **OS code signing is not** — builds are unsigned,
> so first run may still warn (Windows SmartScreen → "Run anyway"; macOS Gatekeeper
> → right-click → Open).

## Auto-update

The app updates itself in-app via the [Tauri updater plugin] — for releases after
the first updater-enabled one, users no longer download installers from GitHub by hand.

**How it works**

- `tauri.conf.json` enables `bundle.createUpdaterArtifacts` and sets
  `plugins.updater` with the signing **public key** plus one endpoint:
  `https://github.com/yusupsupriyadi/sososo/releases/latest/download/latest.json`.
- The frontend drives it (`src/lib/updater.ts` + `src/state/updateStore.ts`): a
  silent check once at launch and a manual **Settings → App update → Check for
  updates**. An available update shows a banner under the titlebar
  (`src/windows/main/UpdateBanner.tsx`): **Download & install** → progress →
  **Restart now** (`@tauri-apps/plugin-process` `relaunch()`). Rust only registers
  the `updater` + `process` plugins (`src-tauri/src/lib.rs`).
- On release, `tauri-action` builds **signed** update artifacts (NSIS `-setup.exe`,
  macOS `.app.tar.gz`, Linux `.AppImage`) and uploads a merged `latest.json` to the
  release. We set `uploadUpdaterSignatures: false`, so the standalone `.sig` files
  are **not** attached as release assets — their signature content is already
  inlined in `latest.json` (the only thing the updater reads at runtime), so the
  loose `.sig` files would just be confusing clutter on the downloads page.

**Signing keys** (one-time, already configured)

- Generated with `tauri signer generate` (minisign). The **public** key is in
  `tauri.conf.json` → `plugins.updater.pubkey`.
- The **private** key + password are GitHub Actions secrets
  `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, passed to
  `tauri-action` in [`release.yml`](../.github/workflows/release.yml). A local
  backup lives at `~/.tauri/sososo.key` (+ `.pub`, `.pw`) — **never commit these**.
- ⚠️ Lose the private key or password and you can no longer ship updates to
  installed apps (users would have to manually install a fresh, re-keyed build).

**Rollout caveat**

Auto-update only works for releases **published after** the updater shipped. The
0.5.0 build has no updater, so users must download the **first** updater-enabled
release (**0.6.0**) once, by hand. From 0.6.0 → 0.7.0 onward it's in-app. Only
NSIS / `.app` / AppImage are updatable (`.msi`/`.deb`/`.rpm` are not), and the
endpoint resolves only to a **published** (not draft) release.

**Verify after publishing**

- The release has a `latest.json` (no standalone `.sig` assets — see above), and
  `latest.json` lists all three platforms with a non-empty inlined `signature` and
  working download URLs.
- Install an older updater-enabled build, publish a newer one, and confirm the
  in-app banner appears and updates successfully.

[Tauri updater plugin]: https://v2.tauri.app/plugin/updater

## Versioning

[Semantic Versioning](https://semver.org/). Keep the version in sync across:

- [`package.json`](../package.json) → `version`
- [`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml) → `package.version`
- [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) → `version`

Then update [`CHANGELOG.md`](../CHANGELOG.md) (Keep a Changelog format) and tag.

## Related

- [Development](./development.md) — local commands and verification.
- [Platform support](./platform-support.md) — per-OS bundle/runtime specifics.
