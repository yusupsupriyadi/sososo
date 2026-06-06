import { create } from 'zustand';

interface LibraryStore {
  /**
   * Bumped to force the session history list to reload. The sidebar is mounted
   * persistently (outside <Routes>), so it can't rely on remounting to refetch.
   * Mutations like delete/rename call refresh() to invalidate the cached list.
   */
  revision: number;
  refresh: () => void;
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  revision: 0,
  refresh: () => set((s) => ({ revision: s.revision + 1 })),
}));
