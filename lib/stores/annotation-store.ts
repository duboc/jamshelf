'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  sanitizeSongAnnotations,
  type InkStroke,
  type SongAnnotations,
  type TextNote,
} from '@/lib/types/annotations';

interface Snapshot {
  strokes: InkStroke[];
  notes: TextNote[];
}

interface SongHistory {
  past: Snapshot[];
  future: Snapshot[];
}

interface AnnotationStore {
  bySong: Record<string, SongAnnotations>;
  historyBySong: Record<string, SongHistory>;
  fetchedSongs: Record<string, boolean>;
  pendingSyncSongs: string[];

  fetchSongAnnotations: (songId: string) => Promise<void>;
  flushPendingSync: (songId?: string, opts?: { keepalive?: boolean }) => Promise<void>;
  addStroke: (songId: string, stroke: InkStroke) => void;
  removeStroke: (songId: string, strokeId: string, opts?: { skipHistory?: boolean }) => void;
  addTextNote: (songId: string, note: TextNote) => void;
  updateTextNote: (
    songId: string,
    noteId: string,
    patch: Partial<Pick<TextNote, 'text' | 'tone' | 'anchor' | 'x' | 'y' | 'align'>>
  ) => void;
  removeTextNote: (songId: string, noteId: string, opts?: { skipHistory?: boolean }) => void;
  pushManualSnapshot: (songId: string, snapshot: Snapshot) => void;
  clearSongAnnotations: (songId: string) => void;
  undo: (songId: string) => boolean;
  redo: (songId: string) => boolean;
}

const MAX_HISTORY = 30;
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

function emptySong(songId: string): SongAnnotations {
  return { songId, strokes: [], notes: [], updatedAt: 0 };
}

function addPending(list: string[], songId: string): string[] {
  return list.includes(songId) ? list : [...list, songId];
}

function removePending(list: string[], songId: string): string[] {
  return list.includes(songId) ? list.filter((id) => id !== songId) : list;
}

function pushUndoSnapshot(
  historyBySong: Record<string, SongHistory>,
  songId: string,
  snap: Snapshot
): Record<string, SongHistory> {
  const cur = historyBySong[songId] ?? { past: [], future: [] };
  const nextPast = [...cur.past.slice(-(MAX_HISTORY - 1)), snap];
  return {
    ...historyBySong,
    [songId]: { past: nextPast, future: [] },
  };
}

async function sendPut(
  songId: string,
  record: SongAnnotations,
  keepalive: boolean
): Promise<boolean> {
  try {
    const res = await fetch(`/api/songs/${encodeURIComponent(songId)}/annotations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      keepalive,
      body: JSON.stringify({
        strokes: record.strokes,
        notes: record.notes,
        updatedAt: record.updatedAt || Date.now(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function scheduleServerSync(
  songId: string,
  getState: () => AnnotationStore,
  setState: (fn: (s: AnnotationStore) => Partial<AnnotationStore>) => void
) {
  setState((s) => ({ pendingSyncSongs: addPending(s.pendingSyncSongs, songId) }));
  const existing = syncTimers.get(songId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    syncTimers.delete(songId);
    const state = getState();
    const record = state.bySong[songId] ?? emptySong(songId);
    const sentUpdatedAt = record.updatedAt;
    void sendPut(songId, record, false).then((ok) => {
      if (!ok) return;
      // Only clear pending flag if no newer edit landed while PUT was in flight
      if ((getState().bySong[songId]?.updatedAt ?? 0) === sentUpdatedAt) {
        setState((s) => ({ pendingSyncSongs: removePending(s.pendingSyncSongs, songId) }));
      }
    });
  }, 650);

  syncTimers.set(songId, timer);
}

export const useAnnotationStore = create<AnnotationStore>()(
  persist(
    (set, get) => ({
      bySong: {},
      historyBySong: {},
      fetchedSongs: {},
      pendingSyncSongs: [],

      fetchSongAnnotations: async (songId) => {
        if (!songId || get().fetchedSongs[songId]) return;
        // Skip pulling remote if local unsynced edits are queued; flush them first instead
        if (get().pendingSyncSongs.includes(songId) || syncTimers.has(songId)) {
          await get().flushPendingSync(songId);
          return;
        }
        try {
          const res = await fetch(`/api/songs/${encodeURIComponent(songId)}/annotations`);
          if (!res.ok) return;
          const json: unknown = await res.json();
          const remote = sanitizeSongAnnotations(songId, json);
          // Re-check local queue after async fetch so in-flight user strokes are never clobbered
          if (get().pendingSyncSongs.includes(songId) || syncTimers.has(songId)) {
            set((s) => ({ fetchedSongs: { ...s.fetchedSongs, [songId]: true } }));
            return;
          }
          const local = get().bySong[songId];
          set((s) => {
            const shouldAdopt =
              !local ||
              (remote.updatedAt > local.updatedAt &&
                (remote.strokes.length > 0 || remote.notes.length > 0 || local.updatedAt > 0));
            return {
              fetchedSongs: { ...s.fetchedSongs, [songId]: true },
              ...(shouldAdopt ? { bySong: { ...s.bySong, [songId]: remote } } : {}),
            };
          });
        } catch {
          // Leave fetchedSongs unset so when connectivity returns we can retry cleanly
        }
      },

      flushPendingSync: async (songId, opts) => {
        const keepalive = Boolean(opts?.keepalive);
        const targets = songId
          ? [songId].filter((id) => get().pendingSyncSongs.includes(id) || syncTimers.has(id))
          : Array.from(new Set([...get().pendingSyncSongs, ...syncTimers.keys()]));
        if (targets.length === 0) return;

        await Promise.all(
          targets.map(async (id) => {
            const t = syncTimers.get(id);
            if (t) {
              clearTimeout(t);
              syncTimers.delete(id);
            }
            const record = get().bySong[id] ?? emptySong(id);
            const sentUpdatedAt = record.updatedAt;
            const ok = await sendPut(id, record, keepalive);
            if (ok && (get().bySong[id]?.updatedAt ?? 0) === sentUpdatedAt) {
              set((s) => ({ pendingSyncSongs: removePending(s.pendingSyncSongs, id) }));
            }
          })
        );
      },

      addStroke: (songId, stroke) => {
        set((s) => {
          const prev = s.bySong[songId] ?? emptySong(songId);
          const next: SongAnnotations = {
            songId,
            strokes: [...prev.strokes.slice(-399), stroke],
            notes: prev.notes,
            updatedAt: Date.now(),
          };
          return {
            bySong: { ...s.bySong, [songId]: next },
            historyBySong: pushUndoSnapshot(s.historyBySong, songId, {
              strokes: prev.strokes,
              notes: prev.notes,
            }),
          };
        });
        scheduleServerSync(songId, get, set);
      },

      removeStroke: (songId, strokeId, opts) => {
        const cur = get().bySong[songId];
        if (!cur || !cur.strokes.some((st) => st.id === strokeId)) return;
        set((s) => {
          const prev = s.bySong[songId] ?? emptySong(songId);
          const next: SongAnnotations = {
            songId,
            strokes: prev.strokes.filter((st) => st.id !== strokeId),
            notes: prev.notes,
            updatedAt: Date.now(),
          };
          return {
            bySong: { ...s.bySong, [songId]: next },
            ...(opts?.skipHistory
              ? {}
              : {
                  historyBySong: pushUndoSnapshot(s.historyBySong, songId, {
                    strokes: prev.strokes,
                    notes: prev.notes,
                  }),
                }),
          };
        });
        scheduleServerSync(songId, get, set);
      },

      addTextNote: (songId, note) => {
        const trimmed = note.text.trim();
        if (!trimmed) return;
        const cleanNote: TextNote = { ...note, text: trimmed.slice(0, 200) };
        set((s) => {
          const prev = s.bySong[songId] ?? emptySong(songId);
          const next: SongAnnotations = {
            songId,
            strokes: prev.strokes,
            notes: [...prev.notes.slice(-119), cleanNote],
            updatedAt: Date.now(),
          };
          return {
            bySong: { ...s.bySong, [songId]: next },
            historyBySong: pushUndoSnapshot(s.historyBySong, songId, {
              strokes: prev.strokes,
              notes: prev.notes,
            }),
          };
        });
        scheduleServerSync(songId, get, set);
      },

      updateTextNote: (songId, noteId, patch) => {
        const cur = get().bySong[songId];
        if (!cur || !cur.notes.some((n) => n.id === noteId)) return;
        set((s) => {
          const prev = s.bySong[songId] ?? emptySong(songId);
          const nextNotes = prev.notes.map((n) => {
            if (n.id !== noteId) return n;
            const updatedText =
              patch.text !== undefined ? patch.text.trim().slice(0, 200) || n.text : n.text;
            return { ...n, ...patch, text: updatedText };
          });
          const next: SongAnnotations = {
            songId,
            strokes: prev.strokes,
            notes: nextNotes,
            updatedAt: Date.now(),
          };
          return {
            bySong: { ...s.bySong, [songId]: next },
            historyBySong: pushUndoSnapshot(s.historyBySong, songId, {
              strokes: prev.strokes,
              notes: prev.notes,
            }),
          };
        });
        scheduleServerSync(songId, get, set);
      },

      removeTextNote: (songId, noteId, opts) => {
        const cur = get().bySong[songId];
        if (!cur || !cur.notes.some((n) => n.id === noteId)) return;
        set((s) => {
          const prev = s.bySong[songId] ?? emptySong(songId);
          const next: SongAnnotations = {
            songId,
            strokes: prev.strokes,
            notes: prev.notes.filter((n) => n.id !== noteId),
            updatedAt: Date.now(),
          };
          return {
            bySong: { ...s.bySong, [songId]: next },
            ...(opts?.skipHistory
              ? {}
              : {
                  historyBySong: pushUndoSnapshot(s.historyBySong, songId, {
                    strokes: prev.strokes,
                    notes: prev.notes,
                  }),
                }),
          };
        });
        scheduleServerSync(songId, get, set);
      },

      pushManualSnapshot: (songId, snapshot) => {
        set((s) => ({
          historyBySong: pushUndoSnapshot(s.historyBySong, songId, snapshot),
        }));
      },

      clearSongAnnotations: (songId) => {
        const cur = get().bySong[songId];
        if (!cur || (cur.strokes.length === 0 && cur.notes.length === 0)) return;
        set((s) => {
          const prev = s.bySong[songId] ?? emptySong(songId);
          const next: SongAnnotations = {
            songId,
            strokes: [],
            notes: [],
            updatedAt: Date.now(),
          };
          return {
            bySong: { ...s.bySong, [songId]: next },
            historyBySong: pushUndoSnapshot(s.historyBySong, songId, {
              strokes: prev.strokes,
              notes: prev.notes,
            }),
          };
        });
        scheduleServerSync(songId, get, set);
      },

      undo: (songId) => {
        const hist = get().historyBySong[songId];
        if (!hist || hist.past.length === 0) return false;
        set((s) => {
          const h = s.historyBySong[songId];
          if (!h || h.past.length === 0) return s;
          const prevSnap = h.past[h.past.length - 1];
          const cur = s.bySong[songId] ?? emptySong(songId);
          const next: SongAnnotations = {
            songId,
            strokes: prevSnap.strokes,
            notes: prevSnap.notes,
            updatedAt: Date.now(),
          };
          return {
            bySong: { ...s.bySong, [songId]: next },
            historyBySong: {
              ...s.historyBySong,
              [songId]: {
                past: h.past.slice(0, -1),
                future: [
                  { strokes: cur.strokes, notes: cur.notes },
                  ...h.future.slice(0, MAX_HISTORY - 1),
                ],
              },
            },
          };
        });
        scheduleServerSync(songId, get, set);
        return true;
      },

      redo: (songId) => {
        const hist = get().historyBySong[songId];
        if (!hist || hist.future.length === 0) return false;
        set((s) => {
          const h = s.historyBySong[songId];
          if (!h || h.future.length === 0) return s;
          const nextSnap = h.future[0];
          const cur = s.bySong[songId] ?? emptySong(songId);
          const next: SongAnnotations = {
            songId,
            strokes: nextSnap.strokes,
            notes: nextSnap.notes,
            updatedAt: Date.now(),
          };
          return {
            bySong: { ...s.bySong, [songId]: next },
            historyBySong: {
              ...s.historyBySong,
              [songId]: {
                past: [
                  ...h.past.slice(-(MAX_HISTORY - 1)),
                  { strokes: cur.strokes, notes: cur.notes },
                ],
                future: h.future.slice(1),
              },
            },
          };
        });
        scheduleServerSync(songId, get, set);
        return true;
      },
    }),
    {
      name: 'jamshelf-annotations',
      skipHydration: true,
      partialize: (s) => ({
        bySong: s.bySong,
        pendingSyncSongs: s.pendingSyncSongs,
      }),
    }
  )
);
