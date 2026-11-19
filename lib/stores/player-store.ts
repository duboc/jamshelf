'use client';

import { create } from 'zustand';

interface PlayerStore {
  transpose: number;
  useFlats: boolean;
  autoScrollSpeed: number; // multiplier around song duration / calibrated marks (1.0 = natural pace)
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
  setAutoScrollSpeed: (s: number) => void;
  toggleAutoScroll: () => void;
  setAutoScrolling: (on: boolean) => void;
  setActiveChord: (c: string | null) => void;
  setMetronomeOn: (on: boolean) => void;
  setBpm: (bpm: number) => void;
  setBeat: (b: number) => void;
  setCapo: (c: number) => void;
  toggleEditMode: () => void;
  setEditMode: (on: boolean) => void;
  resetForSong: (tempo: number, capo: number, savedScrollSpeed?: number | null) => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  transpose: 0,
  useFlats: false,
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
  setAutoScrollSpeed: (sp) =>
    set({ autoScrollSpeed: Math.max(0.25, Math.min(2.5, Number(sp.toFixed(2)))) }),
  toggleAutoScroll: () => set((s) => ({ isAutoScrolling: !s.isAutoScrolling })),
  setAutoScrolling: (on) => set({ isAutoScrolling: on }),
  setActiveChord: (c) => set((s) => ({ activeChord: s.activeChord === c ? null : c })),
  setMetronomeOn: (on) => set({ metronomeOn: on }),
  setBpm: (bpm) => set({ bpm: Math.max(40, Math.min(240, bpm)) }),
  setBeat: (b) => set({ beat: b }),
  setCapo: (c) => set({ capo: Math.max(0, Math.min(12, c)) }),
  toggleEditMode: () =>
    set((s) => ({
      editMode: !s.editMode,
      isAutoScrolling: s.editMode ? s.isAutoScrolling : false,
    })),
  setEditMode: (on) =>
    set((s) => ({
      editMode: on,
      isAutoScrolling: on ? false : s.isAutoScrolling,
    })),
  resetForSong: (tempo, capo, savedScrollSpeed) =>
    set({
      transpose: 0,
      isAutoScrolling: false,
      activeChord: null,
      editMode: false,
      bpm: Math.max(40, Math.min(240, tempo)),
      capo: Math.max(0, Math.min(12, capo)),
      autoScrollSpeed:
        savedScrollSpeed && savedScrollSpeed >= 0.25 && savedScrollSpeed <= 2.5
          ? savedScrollSpeed
          : 1,
    }),
}));
