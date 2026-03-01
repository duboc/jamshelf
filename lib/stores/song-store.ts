'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChordProEntry, ParsedSong } from '@/lib/types/song';
import { parseEntry, patchChordProMeta } from '@/lib/utils/chordpro-parser';
import { DEFAULT_CHORDPRO } from '@/lib/data/default-songs';

interface SongStore {
  entries: ChordProEntry[];

  // Derived accessors (parse on demand)
  getSong: (id: string) => ParsedSong | null;
  getSongs: () => ParsedSong[];
  getEntry: (id: string) => ChordProEntry | null;

  // Mutations
  addEntry: (entry: ChordProEntry) => void;
  removeEntry: (id: string) => void;
  updateEntry: (id: string, text: string) => void;
  patchMeta: (id: string, key: string, value: string | number) => void;

  // Import / Export
  exportEntry: (id: string) => string | null;
  exportAll: () => string;
  importEntries: (text: string) => number;
}

export const useSongStore = create<SongStore>()(
  persist(
    (set, get) => ({
      entries: DEFAULT_CHORDPRO,

      getSong: (id) => {
        const entry = get().entries.find((e) => e.id === id);
        return entry ? parseEntry(entry) : null;
      },

      getSongs: () => get().entries.map(parseEntry),

      getEntry: (id) => get().entries.find((e) => e.id === id) ?? null,

      addEntry: (entry) =>
        set((s) => ({ entries: [...s.entries, entry] })),

      removeEntry: (id) =>
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),

      updateEntry: (id, text) =>
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, text } : e)),
        })),

      patchMeta: (id, key, value) => {
        const entry = get().entries.find((e) => e.id === id);
        if (!entry) return;
        const newText = patchChordProMeta(entry.text, key, value);
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, text: newText } : e)),
        }));
      },

      exportEntry: (id) => {
        const entry = get().entries.find((e) => e.id === id);
        return entry ? entry.text : null;
      },

      exportAll: () =>
        get().entries.map((e) => e.text).join('\n\n---\n\n'),

      importEntries: (text: string) => {
        const raw = text.trim();
        const parts = raw.includes('\n---\n')
          ? raw.split(/\n---\n/)
          : [raw];

        const valid = parts
          .map((t) => t.trim())
          .filter((t) => /^\{title:/im.test(t));

        if (!valid.length) return 0;

        const newEntries: ChordProEntry[] = valid.map((t) => {
          const titleMatch = t.match(/^\{title:\s*(.+)\}$/im);
          const title = titleMatch ? titleMatch[1].trim() : '';
          const id = title
            ? 'song-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
            : 'song-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
          return { id, text: t };
        });

        set((s) => ({ entries: [...s.entries, ...newEntries] }));
        return newEntries.length;
      },
    }),
    { name: 'jamshelf-songs' }
  )
);
