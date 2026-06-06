# Fix: history sidebar not refreshing after delete/rename

**Goal:** Deleting a session from the session-detail view left the deleted item
visible in the "Riwayat" sidebar list (and rename left the old title showing).

## Root cause

- `SessionSidebar` is mounted persistently in `MainApp` *outside* `<Routes>`, so
  it never remounts on navigation.
- Its reload effect depended only on the recording `state` machine. Delete/rename
  don't change `state`, so `listSessions()` was never refetched → stale list.

## Key changes

- New `src/state/libraryStore.ts`: tiny Zustand store with a `revision` counter +
  `refresh()` action.
- `SessionSidebar.tsx`: subscribe to `revision`, add it to the reload effect deps.
- `SessionDetailRoute.tsx`: call `refreshLibrary()` after `deleteSession` (before
  navigating home) and after `renameSession`.

## Decision

- Chose a store-level revision signal over route-based refetching: precise (fires
  only on real mutations), idiomatic with the existing Zustand stores, minimal.

## Verification

- `bun run build` (tsc strict + vite build) — passes, no type errors.
- Committed scope-only (3 files); pre-existing unrelated `MainApp.tsx` edit left
  untouched.
