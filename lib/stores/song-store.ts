import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChordProEntry, ParsedSong } from '@/lib/types/song';
import { parseEntry, patchChordProMeta } from '@/lib/utils/chordpro-parser';
import { DEFAULT_CHORDPRO } from '@/lib/data/default-songs';
import { useSetlistStore } from './setlist-store';

// Per-entry memoization cache keyed by song ID -> { text, parsed }
// Prevents re-running parseChordPro across the entire library on every render.
const parsedCache = new Map<string, { text: string; parsed: ParsedSong }>();

function parseCached(entry: ChordProEntry): ParsedSong {
  const cached = parsedCache.get(entry.id);
  if (cached && cached.text === entry.text) {
    return cached.parsed;
  }
  const parsed = parseEntry(entry);
  parsedCache.set(entry.id, { text: entry.text, parsed });
  return parsed;
}

export function slugifySongId(title: string): string {
  const clean = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return clean ? `song-${clean}` : `song-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function makeUniqueSongId(baseId: string, existingIds: Set<string>): string {
  if (!existingIds.has(baseId)) return baseId;
  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix++;
  }
  return `${baseId}-${suffix}`;
}

interface SongStore {
  entries: ChordProEntry[];
  isLoaded: boolean;
  syncError: string | null;

  clearSyncError: () => void;

  // Database fetch
  fetchEntries: () => Promise<void>;

  // Derived accessors (memoized per entry text)
  getSong: (id: string) => ParsedSong | null;
  getSongs: () => ParsedSong[];
  getEntry: (id: string) => ChordProEntry | null;

  // Mutations
  addEntry: (entry: ChordProEntry) => ChordProEntry;
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
      isLoaded: false,
      syncError: null,

      clearSyncError: () => set({ syncError: null }),

      fetchEntries: async () => {
        try {
          const res = await fetch('/api/songs');
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const data: ChordProEntry[] = await res.json();
          set({ entries: data, isLoaded: true, syncError: null });
        } catch (err) {
          console.error('Failed to fetch songs from database:', err);
          set({
            isLoaded: true,
            syncError: 'Não foi possível sincronizar o repertório com o servidor. Exibindo cópia local.',
          });
        }
      },

      getSong: (id) => {
        const entry = get().entries.find((e) => e.id === id);
        return entry ? parseCached(entry) : null;
      },

      getSongs: () => get().entries.map(parseCached),

      getEntry: (id) => get().entries.find((e) => e.id === id) ?? null,

      addEntry: (entry) => {
        const existingIds = new Set(get().entries.map((e) => e.id));
        const safeId = makeUniqueSongId(entry.id || slugifySongId(''), existingIds);
        const finalEntry: ChordProEntry = { id: safeId, text: entry.text };

        set((s) => ({ entries: [...s.entries, finalEntry], syncError: null }));
        fetch('/api/songs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalEntry),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          })
          .catch((err) => {
            console.error('Failed to sync added song:', err);
            set({ syncError: 'Música adicionada localmente, mas falhou ao salvar no servidor.' });
          });

        return finalEntry;
      },

      removeEntry: (id) => {
        parsedCache.delete(id);
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id), syncError: null }));
        fetch(`/api/songs/${id}`, {
          method: 'DELETE',
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          })
          .catch((err) => {
            console.error('Failed to sync deleted song:', err);
            set({ syncError: 'Não foi possível confirmar a exclusão no servidor.' });
          });

        // Cascade removal from setlists so prev/next and Show Mode never hit a deleted song.
        const setlistStore = useSetlistStore.getState();
        setlistStore.setlists.forEach((sl) => {
          if (sl.songIds.includes(id)) {
            setlistStore.removeSongFromSetlist(sl.id, id);
          }
        });
      },

      updateEntry: (id, text) => {
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, text } : e)),
          syncError: null,
        }));
        fetch(`/api/songs/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          })
          .catch((err) => {
            console.error('Failed to sync updated song:', err);
            set({ syncError: 'Alteração salva neste aparelho, mas falhou ao enviar ao servidor.' });
          });
      },

      patchMeta: (id, key, value) => {
        const entry = get().entries.find((e) => e.id === id);
        if (!entry) return;
        const newText = patchChordProMeta(entry.text, key, value);
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, text: newText } : e)),
          syncError: null,
        }));
        fetch(`/api/songs/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: newText }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          })
          .catch((err) => {
            console.error('Failed to sync patched song metadata:', err);
            set({ syncError: 'Alteração salva localmente, mas falhou ao sincronizar com o servidor.' });
          });
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

        const existingIds = new Set(get().entries.map((e) => e.id));
        const newEntries: ChordProEntry[] = valid.map((t) => {
          const titleMatch = t.match(/^\{title:\s*(.+)\}$/im);
          const title = titleMatch ? titleMatch[1].trim() : '';
          const baseId = slugifySongId(title);
          const id = makeUniqueSongId(baseId, existingIds);
          existingIds.add(id);
          return { id, text: t };
        });

        set((s) => ({ entries: [...s.entries, ...newEntries], syncError: null }));

        newEntries.forEach((entry) => {
          fetch('/api/songs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry),
          })
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
            })
            .catch((err) => {
              console.error('Failed to sync imported song:', err);
              set({ syncError: 'Parte da importação falhou ao salvar no servidor.' });
            });
        });

        return newEntries.length;
      },
    }),
    {
      name: 'jamshelf-songs',
      skipHydration: true,
      partialize: (s) => ({ entries: s.entries }),
    }
  )
);
