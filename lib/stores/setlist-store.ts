import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Setlist } from '@/lib/types/song';

interface SetlistStore {
  setlists: Setlist[];
  isLoaded: boolean;
  syncError: string | null;
  clearSyncError: () => void;
  fetchSetlists: () => Promise<void>;
  createSetlist: (name: string) => Setlist;
  deleteSetlist: (id: string) => void;
  renameSetlist: (id: string, name: string) => void;
  addSongToSetlist: (setlistId: string, songId: string) => void;
  removeSongFromSetlist: (setlistId: string, songId: string) => void;
  reorderSong: (setlistId: string, fromIdx: number, toIdx: number) => void;
}

export const useSetlistStore = create<SetlistStore>()(
  persist(
    (set, get) => ({
      setlists: [],
      isLoaded: false,
      syncError: null,

      clearSyncError: () => set({ syncError: null }),

      fetchSetlists: async () => {
        try {
          const res = await fetch('/api/setlists');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data: Setlist[] = await res.json();
          set({ setlists: data, isLoaded: true, syncError: null });
        } catch (err) {
          console.error('Failed to fetch setlists:', err);
          set({
            isLoaded: true,
            syncError: 'Não foi possível sincronizar os setlists com o servidor.',
          });
        }
      },

      createSetlist: (name) => {
        const setlist: Setlist = {
          id: 'setlist-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          name,
          songIds: [],
          createdAt: Date.now(),
        };
        set((s) => ({ setlists: [...s.setlists, setlist], syncError: null }));
        fetch('/api/setlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(setlist),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          })
          .catch((err) => {
            console.error('Failed to sync created setlist:', err);
            set({ syncError: 'Setlist criado localmente, mas falhou ao salvar no servidor.' });
          });
        return setlist;
      },

      deleteSetlist: (id) => {
        set((s) => ({ setlists: s.setlists.filter((sl) => sl.id !== id), syncError: null }));
        fetch(`/api/setlists/${id}`, {
          method: 'DELETE',
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          })
          .catch((err) => {
            console.error('Failed to sync deleted setlist:', err);
            set({ syncError: 'Não foi possível confirmar a exclusão do setlist no servidor.' });
          });
      },

      renameSetlist: (id, name) => {
        set((s) => ({
          setlists: s.setlists.map((sl) => (sl.id === id ? { ...sl, name } : sl)),
          syncError: null,
        }));
        fetch(`/api/setlists/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          })
          .catch((err) => {
            console.error('Failed to sync renamed setlist:', err);
            set({ syncError: 'Novo nome salvo localmente, mas falhou ao enviar ao servidor.' });
          });
      },

      addSongToSetlist: (setlistId, songId) => {
        const sl = get().setlists.find((s) => s.id === setlistId);
        if (!sl || sl.songIds.includes(songId)) return;
        const newSongIds = [...sl.songIds, songId];
        set((s) => ({
          setlists: s.setlists.map((sl) =>
            sl.id === setlistId ? { ...sl, songIds: newSongIds } : sl
          ),
          syncError: null,
        }));
        fetch(`/api/setlists/${setlistId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songIds: newSongIds }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          })
          .catch((err) => {
            console.error('Failed to sync song addition to setlist:', err);
            set({ syncError: 'Alteração no setlist falhou ao sincronizar com o servidor.' });
          });
      },

      removeSongFromSetlist: (setlistId, songId) => {
        const sl = get().setlists.find((s) => s.id === setlistId);
        if (!sl) return;
        const newSongIds = sl.songIds.filter((id) => id !== songId);
        set((s) => ({
          setlists: s.setlists.map((sl) =>
            sl.id === setlistId ? { ...sl, songIds: newSongIds } : sl
          ),
          syncError: null,
        }));
        fetch(`/api/setlists/${setlistId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songIds: newSongIds }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          })
          .catch((err) => {
            console.error('Failed to sync song removal from setlist:', err);
            set({ syncError: 'Alteração no setlist falhou ao sincronizar com o servidor.' });
          });
      },

      reorderSong: (setlistId, fromIdx, toIdx) => {
        const sl = get().setlists.find((s) => s.id === setlistId);
        if (!sl) return;
        const ids = [...sl.songIds];
        const [moved] = ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, moved);
        set((s) => ({
          setlists: s.setlists.map((sl) =>
            sl.id === setlistId ? { ...sl, songIds: ids } : sl
          ),
          syncError: null,
        }));
        fetch(`/api/setlists/${setlistId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songIds: ids }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          })
          .catch((err) => {
            console.error('Failed to sync setlist reorder:', err);
            set({ syncError: 'Ordem do setlist salva localmente, mas falhou ao sincronizar.' });
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
