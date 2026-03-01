'use client';

import { create } from 'zustand';

interface PlayerStore {
  transpose: number;
  useFlats: boolean;
  fontSize: number;
  autoScrollSpeed: number;
  isAutoScrolling: boolean;
  activeChord: string | null;
  metronomeOn: boolean;
  bpm: number;
  beat: number;
  capo: number;
  editMode: boolean;

  setTranspose: (v: number) => void;
  transposeUp: () => void;
  transposeDown: () => void;
  toggleFlats: () => void;
  setFontSize: (s: number) => void;
  setAutoScrollSpeed: (s: number) => void;
  toggleAutoScroll: () => void;
  setActiveChord: (c: string | null) => void;
  setMetronomeOn: (on: boolean) => void;
  setBpm: (bpm: number) => void;
  setBeat: (b: number) => void;
  setCapo: (c: number) => void;
  toggleEditMode: () => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  transpose: 0,
  useFlats: false,
  fontSize: 100,
  autoScrollSpeed: 1,
  isAutoScrolling: false,
  activeChord: null,
  metronomeOn: false,
  bpm: 120,
  beat: 0,
  capo: 0,
  editMode: false,

  setTranspose: (v) => set({ transpose: ((v % 12) + 12) % 12 }),
  transposeUp: () => set((s) => ({ transpose: ((s.transpose + 1) % 12 + 12) % 12 })),
  transposeDown: () => set((s) => ({ transpose: ((s.transpose - 1) % 12 + 12) % 12 })),
  toggleFlats: () => set((s) => ({ useFlats: !s.useFlats })),
  setFontSize: (sz) => set({ fontSize: Math.max(60, Math.min(160, sz)) }),
  setAutoScrollSpeed: (sp) => set({ autoScrollSpeed: sp }),
  toggleAutoScroll: () => set((s) => ({ isAutoScrolling: !s.isAutoScrolling })),
  setActiveChord: (c) => set((s) => ({ activeChord: s.activeChord === c ? null : c })),
  setMetronomeOn: (on) => set({ metronomeOn: on }),
  setBpm: (bpm) => set({ bpm: Math.max(40, Math.min(240, bpm)) }),
  setBeat: (b) => set({ beat: b }),
  setCapo: (c) => set({ capo: Math.max(0, Math.min(12, c)) }),
  toggleEditMode: () => set((s) => ({
    editMode: !s.editMode,
    // disable auto-scroll when entering edit mode
    isAutoScrolling: s.editMode ? s.isAutoScrolling : false,
  })),
}));
