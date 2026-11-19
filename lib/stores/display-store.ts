'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DisplayMode = 'both' | 'lyrics-only' | 'chords-only';
export type ThemeMode = 'system' | 'dark' | 'light';
export type ScrollLeadIn = 0 | 3 | 5;

interface DisplayStore {
  displayMode: DisplayMode;
  setDisplayMode: (m: DisplayMode) => void;
  toggleHideChords: () => void;
  visualPulseEnabled: boolean;
  setVisualPulseEnabled: (v: boolean) => void;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  fontSize: number;
  setFontSize: (s: number) => void;
  chordsRefOpen: boolean;
  setChordsRefOpen: (v: boolean) => void;
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
  scrollLeadInSec: ScrollLeadIn;
  setScrollLeadInSec: (s: ScrollLeadIn) => void;
}

// Per-device preferences persisted across reloads. Kept separate from
// player-store so live-session sync (which only reads/writes player-store)
// never overwrites a singer's or guitarist's local display choices.
export const useDisplayStore = create<DisplayStore>()(
  persist(
    (set) => ({
      displayMode: 'both',
      setDisplayMode: (m) => set({ displayMode: m }),
      toggleHideChords: () =>
        set((s) => ({
          displayMode: s.displayMode === 'lyrics-only' ? 'both' : 'lyrics-only',
        })),
      visualPulseEnabled: true,
      setVisualPulseEnabled: (v) => set({ visualPulseEnabled: v }),
      theme: 'system',
      setTheme: (t) => set({ theme: t }),
      fontSize: 100,
      setFontSize: (sz) => set({ fontSize: Math.max(70, Math.min(180, sz)) }),
      chordsRefOpen: false,
      setChordsRefOpen: (v) => set({ chordsRefOpen: v }),
      focusMode: false,
      setFocusMode: (v) => set({ focusMode: v }),
      scrollLeadInSec: 3,
      setScrollLeadInSec: (s) => set({ scrollLeadInSec: s }),
    }),
    {
      name: 'jamshelf-display-mode',
      skipHydration: true,
      partialize: (s) => ({
        displayMode: s.displayMode,
        visualPulseEnabled: s.visualPulseEnabled,
        theme: s.theme,
        fontSize: s.fontSize,
        chordsRefOpen: s.chordsRefOpen,
        scrollLeadInSec: s.scrollLeadInSec,
      }),
    }
  )
);
