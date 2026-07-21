'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DisplayMode = 'both' | 'lyrics-only' | 'chords-only';

interface DisplayStore {
  displayMode: DisplayMode;
  setDisplayMode: (m: DisplayMode) => void;
  visualPulseEnabled: boolean;
  setVisualPulseEnabled: (v: boolean) => void;
}

// Deliberately its own store, not a field on player-store: this is a
// per-device preference (which musician, which physical device) that must
// persist across reloads, unlike player-store's session-scoped UI state.
// Keeping it separate also means live-session-store's tick()/startLeading()
// — which only ever read usePlayerStore.getState() — have no way to touch
// it, even by accident.
export const useDisplayStore = create<DisplayStore>()(
  persist(
    (set) => ({
      displayMode: 'both',
      setDisplayMode: (m) => set({ displayMode: m }),
      visualPulseEnabled: true,
      setVisualPulseEnabled: (v) => set({ visualPulseEnabled: v }),
    }),
    { name: 'jamshelf-display-mode' }
  )
);
