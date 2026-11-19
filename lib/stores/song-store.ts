import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChordProEntry, ParsedSong } from '@/lib/types/song';
import { parseEntry, patchChordProMeta } from '@/lib/utils/chordpro-parser';
import { DEFAULT_CHORDPRO } from '@/lib/data/default-songs';
import { useSetlistStore } from './setlist-store';

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

type PendingSongOp =
  | { kind: 'create'; entry: ChordProEntry }
  | { kind: 'update'; id: string; text: string }
  | { kind: 'delete'; id: string };

interface SongStore {
  entries: ChordProEntry[];
  isLoaded: boolean;
  syncError: string | null;
  pendingOps: PendingSongOp[];

  clearSyncError: () => void;
  fetchEntries: () => Promise<void>;
  retryPendingSync: () => Promise<boolean>;

  getSong: (id: string) => ParsedSong | null;
  getSongs: () => ParsedSong[];
  getEntry: (id: string) => ChordProEntry | null;

  addEntry: (entry: ChordProEntry) => ChordProEntry;
  removeEntry: (id: string) => void;
  updateEntry: (id: string, text: string) => void;
  patchMeta: (id: string, key: string, value: string | number) => void;

  exportEntry: (id: string) => string | null;
  exportAll: () => string;
  importEntries: (text: string) => number;
  importEntriesDetailed: (text: string) => { imported: number; skipped: number };
}

async function runSongOp(op: PendingSongOp): Promise<void> {
  if (op.kind === 'create') {
    const res = await fetch('/api/songs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op.entry),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } else if (op.kind === 'update') {
    const res = await fetch(`/api/songs/${op.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: op.text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } else {
    const res = await fetch(`/api/songs/${op.id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
  }
}

function enqueueOp(ops: PendingSongOp[], next: PendingSongOp): PendingSongOp[] {
  const id = next.kind === 'create' ? next.entry.id : next.id;
  const filtered = ops.filter((o) => (o.kind === 'create' ? o.entry.id : o.id) !== id);
  return [...filtered, next];
}

export const useSongStore = create<SongStore>()(
  persist(
    (set, get) => ({
      entries: DEFAULT_CHORDPRO,
      isLoaded: false,
      syncError: null,
      pendingOps: [],

      clearSyncError: () => set({ syncError: null }),

      fetchEntries: async () => {
        try {
          const res = await fetch('/api/songs');
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const data: ChordProEntry[] = await res.json();
          set({ entries: data, isLoaded: true, syncError: null, pendingOps: [] });
        } catch (err) {
          console.error('Failed to fetch songs from database:', err);
          set({
            isLoaded: true,
            syncError: 'Não foi possível sincronizar o repertório com o servidor. Exibindo cópia local.',
          });
        }
      },

      retryPendingSync: async () => {
        const ops = get().pendingOps;
        if (ops.length === 0) {
          await get().fetchEntries();
          return get().syncError === null;
        }
        const remaining: PendingSongOp[] = [];
        for (const op of ops) {
          try {
            await runSongOp(op);
          } catch {
            remaining.push(op);
          }
        }
        if (remaining.length === 0) {
          set({ pendingOps: [], syncError: null });
          return true;
        }
        set({
          pendingOps: remaining,
          syncError: `${remaining.length} alteração(ões) ainda não sincronizadas com o servidor.`,
        });
        return false;
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
        const op: PendingSongOp = { kind: 'create', entry: finalEntry };

        set((s) => ({ entries: [...s.entries, finalEntry], syncError: null }));
        runSongOp(op).catch((err) => {
          console.error('Failed to sync added song:', err);
          set((s) => ({
            pendingOps: enqueueOp(s.pendingOps, op),
            syncError: 'Música adicionada localmente, mas falhou ao salvar no servidor.',
          }));
        });

        return finalEntry;
      },

      removeEntry: (id) => {
        parsedCache.delete(id);
        const op: PendingSongOp = { kind: 'delete', id };
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id), syncError: null }));
        runSongOp(op).catch((err) => {
          console.error('Failed to sync deleted song:', err);
          set((s) => ({
            pendingOps: enqueueOp(s.pendingOps, op),
            syncError: 'Não foi possível confirmar a exclusão no servidor.',
          }));
        });

        const setlistStore = useSetlistStore.getState();
        setlistStore.setlists.forEach((sl) => {
          if (sl.songIds.includes(id)) {
            setlistStore.removeSongFromSetlist(sl.id, id);
          }
        });
      },

      updateEntry: (id, text) => {
        const op: PendingSongOp = { kind: 'update', id, text };
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, text } : e)),
          syncError: null,
        }));
        runSongOp(op).catch((err) => {
          console.error('Failed to sync updated song:', err);
          set((s) => ({
            pendingOps: enqueueOp(s.pendingOps, op),
            syncError: 'Alteração salva neste aparelho, mas falhou ao enviar ao servidor.',
          }));
        });
      },

      patchMeta: (id, key, value) => {
        const entry = get().entries.find((e) => e.id === id);
        if (!entry) return;
        const newText = patchChordProMeta(entry.text, key, value);
        const op: PendingSongOp = { kind: 'update', id, text: newText };
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, text: newText } : e)),
          syncError: null,
        }));
        runSongOp(op).catch((err) => {
          console.error('Failed to sync patched song metadata:', err);
          set((s) => ({
            pendingOps: enqueueOp(s.pendingOps, op),
            syncError: 'Alteração salva localmente, mas falhou ao sincronizar com o servidor.',
          }));
        });
      },

      exportEntry: (id) => {
        const entry = get().entries.find((e) => e.id === id);
        return entry ? entry.text : null;
      },

      exportAll: () => get().entries.map((e) => e.text).join('\n\n---\n\n'),

      importEntriesDetailed: (text: string) => {
        const raw = text.trim();
        if (!raw) return { imported: 0, skipped: 0 };
        const parts = raw
          .split(/\r?\n---\r?\n/)
          .map((t) => t.trim())
          .filter(Boolean);

        const valid = parts.filter((t) => /^\{title:/im.test(t));
        const skipped = parts.length - valid.length;
        if (!valid.length) return { imported: 0, skipped };

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
          const op: PendingSongOp = { kind: 'create', entry };
          runSongOp(op).catch((err) => {
            console.error('Failed to sync imported song:', err);
            set((s) => ({
              pendingOps: enqueueOp(s.pendingOps, op),
              syncError: 'Parte da importação falhou ao salvar no servidor.',
            }));
          });
        });

        return { imported: newEntries.length, skipped };
      },

      importEntries: (text: string) => get().importEntriesDetailed(text).imported,
    }),
    {
      name: 'jamshelf-songs',
      skipHydration: true,
      partialize: (s) => ({ entries: s.entries }),
    }
  )
);
