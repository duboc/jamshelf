'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DisplayMode = 'both' | 'lyrics-only' | 'chords-only';
export type ThemeMode = 'system' | 'dark' | 'light';
export type ScrollLeadIn = 0 | 3 | 5;
export type LibraryViewMode = 'cards' | 'list';
export type CapoDisplay = 'sounding' | 'shapes';
export type SheetColumns = 1 | 2;

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
  viewMode: LibraryViewMode;
  setViewMode: (v: LibraryViewMode) => void;
  capoDisplay: CapoDisplay;
  setCapoDisplay: (c: CapoDisplay) => void;
  sheetColumns: SheetColumns;
  setSheetColumns: (c: SheetColumns) => void;
  singleKeyShortcuts: boolean;
  setSingleKeyShortcuts: (v: boolean) => void;
}

let themeTransitionTimer: ReturnType<typeof setTimeout> | null = null;

function applyThemeToDom(theme: ThemeMode, animate: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (animate && !reduced) {
    root.classList.add('gm3-theme-transitioning');
    if (themeTransitionTimer) clearTimeout(themeTransitionTimer);
    themeTransitionTimer = setTimeout(() => {
      root.classList.remove('gm3-theme-transitioning');
      themeTransitionTimer = null;
    }, 380);
  }

  if (theme === 'dark' || theme === 'light') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }
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
      // Default off for WCAG 2.3.1 safety; musicians can opt in per device
      visualPulseEnabled: false,
      setVisualPulseEnabled: (v) => set({ visualPulseEnabled: v }),
      theme: 'system',
      setTheme: (t) => {
        applyThemeToDom(t, true);
        set({ theme: t });
      },
      fontSize: 100,
      setFontSize: (sz) => set({ fontSize: Math.max(70, Math.min(180, sz)) }),
      chordsRefOpen: false,
      setChordsRefOpen: (v) => set({ chordsRefOpen: v }),
      focusMode: false,
      setFocusMode: (v) => set({ focusMode: v }),
      scrollLeadInSec: 3,
      setScrollLeadInSec: (s) => set({ scrollLeadInSec: s }),
      viewMode: 'cards',
      setViewMode: (v) => set({ viewMode: v }),
      capoDisplay: 'sounding',
      setCapoDisplay: (c) => set({ capoDisplay: c }),
      sheetColumns: 1,
      setSheetColumns: (c) => set({ sheetColumns: c }),
      singleKeyShortcuts: true,
      setSingleKeyShortcuts: (v) => set({ singleKeyShortcuts: v }),
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
        viewMode: s.viewMode,
        capoDisplay: s.capoDisplay,
        sheetColumns: s.sheetColumns,
        singleKeyShortcuts: s.singleKeyShortcuts,
      }),
    }
  )
);
