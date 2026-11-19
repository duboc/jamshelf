import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Setlist } from '@/lib/types/song';

type PendingSetlistOp =
  | { kind: 'create'; setlist: Setlist }
  | { kind: 'update'; id: string; body: Partial<Pick<Setlist, 'name' | 'songIds'>> }
  | { kind: 'delete'; id: string };

interface SetlistStore {
  setlists: Setlist[];
  isLoaded: boolean;
  syncError: string | null;
  pendingOps: PendingSetlistOp[];
  clearSyncError: () => void;
  fetchSetlists: () => Promise<void>;
  retryPendingSync: () => Promise<boolean>;
  createSetlist: (name: string) => Setlist;
  deleteSetlist: (id: string) => void;
  renameSetlist: (id: string, name: string) => void;
  addSongToSetlist: (setlistId: string, songId: string) => void;
  insertSongAt: (setlistId: string, songId: string, index: number) => void;
  removeSongFromSetlist: (setlistId: string, songId: string) => void;
  reorderSong: (setlistId: string, fromIdx: number, toIdx: number) => void;
}

async function runSetlistOp(op: PendingSetlistOp): Promise<void> {
  if (op.kind === 'create') {
    const res = await fetch('/api/setlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op.setlist),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } else if (op.kind === 'update') {
    const res = await fetch(`/api/setlists/${op.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op.body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } else {
    const res = await fetch(`/api/setlists/${op.id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
  }
}

function enqueueSetlistOp(ops: PendingSetlistOp[], next: PendingSetlistOp): PendingSetlistOp[] {
  const id = next.kind === 'create' ? next.setlist.id : next.id;
  const filtered = ops.filter((o) => (o.kind === 'create' ? o.setlist.id : o.id) !== id);
  return [...filtered, next];
}

export const useSetlistStore = create<SetlistStore>()(
  persist(
    (set, get) => ({
      setlists: [],
      isLoaded: false,
      syncError: null,
      pendingOps: [],

      clearSyncError: () => set({ syncError: null }),

      fetchSetlists: async () => {
        try {
          const res = await fetch('/api/setlists');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data: Setlist[] = await res.json();
          set({ setlists: data, isLoaded: true, syncError: null, pendingOps: [] });
        } catch (err) {
          console.error('Failed to fetch setlists:', err);
          set({
            isLoaded: true,
            syncError: 'Não foi possível sincronizar os setlists com o servidor.',
          });
        }
      },

      retryPendingSync: async () => {
        const ops = get().pendingOps;
        if (ops.length === 0) {
          await get().fetchSetlists();
          return get().syncError === null;
        }
        const remaining: PendingSetlistOp[] = [];
        for (const op of ops) {
          try {
            await runSetlistOp(op);
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
          syncError: `${remaining.length} alteração(ões) de setlist ainda não sincronizadas.`,
        });
        return false;
      },

      createSetlist: (name) => {
        const setlist: Setlist = {
          id: 'setlist-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          name,
          songIds: [],
          createdAt: Date.now(),
        };
        const op: PendingSetlistOp = { kind: 'create', setlist };
        set((s) => ({ setlists: [...s.setlists, setlist], syncError: null }));
        runSetlistOp(op).catch((err) => {
          console.error('Failed to sync created setlist:', err);
          set((s) => ({
            pendingOps: enqueueSetlistOp(s.pendingOps, op),
            syncError: 'Setlist criado localmente, mas falhou ao salvar no servidor.',
          }));
        });
        return setlist;
      },

      deleteSetlist: (id) => {
        const op: PendingSetlistOp = { kind: 'delete', id };
        set((s) => ({ setlists: s.setlists.filter((sl) => sl.id !== id), syncError: null }));
        runSetlistOp(op).catch((err) => {
          console.error('Failed to sync deleted setlist:', err);
          set((s) => ({
            pendingOps: enqueueSetlistOp(s.pendingOps, op),
            syncError: 'Não foi possível confirmar a exclusão do setlist no servidor.',
          }));
        });
      },

      renameSetlist: (id, name) => {
        const op: PendingSetlistOp = { kind: 'update', id, body: { name } };
        set((s) => ({
          setlists: s.setlists.map((sl) => (sl.id === id ? { ...sl, name } : sl)),
          syncError: null,
        }));
        runSetlistOp(op).catch((err) => {
          console.error('Failed to sync renamed setlist:', err);
          set((s) => ({
            pendingOps: enqueueSetlistOp(s.pendingOps, op),
            syncError: 'Novo nome salvo localmente, mas falhou ao sincronizar.',
          }));
        });
      },

      addSongToSetlist: (setlistId, songId) => {
        const target = get().setlists.find((sl) => sl.id === setlistId);
        if (!target || target.songIds.includes(songId)) return;
        const songIds = [...target.songIds, songId];
        const op: PendingSetlistOp = { kind: 'update', id: setlistId, body: { songIds } };
        set((s) => ({
          setlists: s.setlists.map((sl) => (sl.id === setlistId ? { ...sl, songIds } : sl)),
          syncError: null,
        }));
        runSetlistOp(op).catch((err) => {
          console.error('Failed to sync setlist song addition:', err);
          set((s) => ({
            pendingOps: enqueueSetlistOp(s.pendingOps, op),
            syncError: 'Música incluída localmente, mas falhou ao salvar no servidor.',
          }));
        });
      },

      insertSongAt: (setlistId, songId, index) => {
        const target = get().setlists.find((sl) => sl.id === setlistId);
        if (!target || target.songIds.includes(songId)) return;
        const clamped = Math.max(0, Math.min(target.songIds.length, index));
        const songIds = [...target.songIds];
        songIds.splice(clamped, 0, songId);
        const op: PendingSetlistOp = { kind: 'update', id: setlistId, body: { songIds } };
        set((s) => ({
          setlists: s.setlists.map((sl) => (sl.id === setlistId ? { ...sl, songIds } : sl)),
          syncError: null,
        }));
        runSetlistOp(op).catch((err) => {
          console.error('Failed to sync setlist song restore:', err);
          set((s) => ({
            pendingOps: enqueueSetlistOp(s.pendingOps, op),
            syncError: 'Música restaurada localmente, mas falhou ao sincronizar.',
          }));
        });
      },

      removeSongFromSetlist: (setlistId, songId) => {
        const target = get().setlists.find((sl) => sl.id === setlistId);
        if (!target) return;
        const songIds = target.songIds.filter((id) => id !== songId);
        const op: PendingSetlistOp = { kind: 'update', id: setlistId, body: { songIds } };
        set((s) => ({
          setlists: s.setlists.map((sl) => (sl.id === setlistId ? { ...sl, songIds } : sl)),
          syncError: null,
        }));
        runSetlistOp(op).catch((err) => {
          console.error('Failed to sync setlist song removal:', err);
          set((s) => ({
            pendingOps: enqueueSetlistOp(s.pendingOps, op),
            syncError: 'Remoção salva localmente, mas falhou ao sincronizar.',
          }));
        });
      },

      reorderSong: (setlistId, fromIdx, toIdx) => {
        const target = get().setlists.find((sl) => sl.id === setlistId);
        if (!target) return;
        const ids = [...target.songIds];
        const [moved] = ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, moved);
        const op: PendingSetlistOp = { kind: 'update', id: setlistId, body: { songIds: ids } };
        set((s) => ({
          setlists: s.setlists.map((sl) => (sl.id === setlistId ? { ...sl, songIds: ids } : sl)),
          syncError: null,
        }));
        runSetlistOp(op).catch((err) => {
          console.error('Failed to sync setlist reorder:', err);
          set((s) => ({
            pendingOps: enqueueSetlistOp(s.pendingOps, op),
            syncError: 'Ordem do setlist salva localmente, mas falhou ao sincronizar.',
          }));
        });
      },
    }),
    {
      name: 'jamshelf-setlists',
      skipHydration: true,
      partialize: (s) => ({ setlists: s.setlists }),
    }
  )
);
