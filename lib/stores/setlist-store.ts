import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Setlist } from '@/lib/types/song';

interface SetlistStore {
  setlists: Setlist[];
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

      fetchSetlists: async () => {
        try {
          const res = await fetch('/api/setlists');
          if (res.ok) {
            const data = await res.json();
            set({ setlists: data });
          }
        } catch (err) {
          console.error('Failed to fetch setlists:', err);
        }
      },

      createSetlist: (name) => {
        const setlist: Setlist = {
          id: 'setlist-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          name,
          songIds: [],
          createdAt: Date.now(),
        };
        set((s) => ({ setlists: [...s.setlists, setlist] }));
        fetch('/api/setlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(setlist),
        }).catch((err) => console.error('Failed to sync created setlist:', err));
        return setlist;
      },

      deleteSetlist: (id) => {
        set((s) => ({ setlists: s.setlists.filter((sl) => sl.id !== id) }));
        fetch(`/api/setlists/${id}`, {
          method: 'DELETE',
        }).catch((err) => console.error('Failed to sync deleted setlist:', err));
      },

      renameSetlist: (id, name) => {
        set((s) => ({
          setlists: s.setlists.map((sl) => (sl.id === id ? { ...sl, name } : sl)),
        }));
        fetch(`/api/setlists/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        }).catch((err) => console.error('Failed to sync renamed setlist:', err));
      },

      addSongToSetlist: (setlistId, songId) => {
        const sl = get().setlists.find((s) => s.id === setlistId);
        if (!sl || sl.songIds.includes(songId)) return;
        const newSongIds = [...sl.songIds, songId];
        set((s) => ({
          setlists: s.setlists.map((sl) =>
            sl.id === setlistId ? { ...sl, songIds: newSongIds } : sl
          ),
        }));
        fetch(`/api/setlists/${setlistId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songIds: newSongIds }),
        }).catch((err) => console.error('Failed to sync song addition to setlist:', err));
      },

      removeSongFromSetlist: (setlistId, songId) => {
        const sl = get().setlists.find((s) => s.id === setlistId);
        if (!sl) return;
        const newSongIds = sl.songIds.filter((id) => id !== songId);
        set((s) => ({
          setlists: s.setlists.map((sl) =>
            sl.id === setlistId ? { ...sl, songIds: newSongIds } : sl
          ),
        }));
        fetch(`/api/setlists/${setlistId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songIds: newSongIds }),
        }).catch((err) => console.error('Failed to sync song removal from setlist:', err));
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
        }));
        fetch(`/api/setlists/${setlistId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songIds: ids }),
        }).catch((err) => console.error('Failed to sync setlist reorder:', err));
      },
    }),
    { name: 'jamshelf-setlists' }
  )
);
