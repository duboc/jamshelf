'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useSongStore } from '@/lib/stores/song-store';

export default function SetlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { setlists, renameSetlist, removeSongFromSetlist, reorderSong, addSongToSetlist } = useSetlistStore();
  const { getSongs } = useSongStore();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [showAddSong, setShowAddSong] = useState(false);
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);

  const setlist = setlists.find((sl) => sl.id === id);

  if (!setlist) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Setlist not found.{' '}
        <button onClick={() => router.push('/')} className="text-violet-400 underline ml-2">
          Go back
        </button>
      </div>
    );
  }

  const allSongs = getSongs();
  const setlistSongs = setlist.songIds
    .map((sid) => allSongs.find((s) => s.id === sid))
    .filter(Boolean) as ReturnType<typeof getSongs>;

  const notInSetlist = allSongs.filter((s) => !setlist.songIds.includes(s.id));
  const filtered = notInSetlist.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.artist.toLowerCase().includes(search.toLowerCase())
  );

  const startRename = () => {
    setNameInput(setlist.name);
    setEditingName(true);
  };

  const commitRename = () => {
    if (nameInput.trim()) renameSetlist(id, nameInput.trim());
    setEditingName(false);
  };

  // Minimal drag-to-reorder
  const handleDragStart = (idx: number) => setDragging(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragging !== null && dragging !== idx) {
      reorderSong(id, dragging, idx);
      setDragging(idx);
    }
  };
  const handleDragEnd = () => setDragging(null);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="text-zinc-400 hover:text-white transition-colors text-sm"
            >
              &larr; Back
            </button>
            {editingName ? (
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                className="text-lg font-bold font-display bg-transparent border-b border-violet-500 outline-none text-zinc-100 min-w-[160px]"
              />
            ) : (
              <h1
                className="text-lg font-bold font-display text-zinc-100 cursor-pointer hover:text-violet-300 transition-colors"
                title="Click to rename"
                onClick={startRename}
              >
                {setlist.name}
              </h1>
            )}
            <span className="text-xs text-zinc-500">{setlistSongs.length} songs</span>
          </div>

          <button
            onClick={() => setShowAddSong(!showAddSong)}
            className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
          >
            + Add Song
          </button>
        </div>
      </header>

      {/* Add song picker */}
      {showAddSong && (
        <div className="border-b border-zinc-800 px-4 py-3 bg-zinc-950">
          <div className="max-w-3xl mx-auto space-y-2">
            <input
              autoFocus
              type="text"
              placeholder="Search songs to add..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-500 transition-colors text-sm"
            />
            <div className="max-h-56 overflow-y-auto space-y-1">
              {filtered.length === 0 && (
                <div className="text-center py-6 text-zinc-500 text-sm">
                  {notInSetlist.length === 0 ? 'All songs are in this setlist.' : 'No songs match.'}
                </div>
              )}
              {filtered.map((song) => (
                <button
                  key={song.id}
                  onClick={() => {
                    addSongToSetlist(id, song.id);
                    setSearch('');
                  }}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all text-left"
                >
                  <div>
                    <div className="text-sm font-medium text-zinc-100">{song.title}</div>
                    <div className="text-xs text-zinc-500">{song.artist}</div>
                  </div>
                  <span className="text-violet-400 text-lg">+</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setShowAddSong(false); setSearch(''); }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Song list */}
      <main className="flex-1 px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-2">
          {setlistSongs.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              No songs yet. Tap &ldquo;+ Add Song&rdquo; to build your setlist.
            </div>
          ) : (
            setlistSongs.map((song, idx) => (
              <div
                key={song.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={`group flex items-center gap-3 p-4 rounded-xl bg-zinc-900 border transition-all cursor-grab active:cursor-grabbing ${
                  dragging === idx
                    ? 'border-violet-500 bg-zinc-800 opacity-70'
                    : 'border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Drag handle + number */}
                <div className="flex flex-col items-center gap-0.5 text-zinc-600 select-none min-w-[24px]">
                  <span className="text-[10px] font-mono text-zinc-500">{idx + 1}</span>
                  <span className="text-xs leading-none">⠿</span>
                </div>

                <Link href={`/song/${song.id}`} className="flex-1 min-w-0">
                  <div className="font-semibold text-zinc-100 truncate">{song.title}</div>
                  <div className="text-sm text-zinc-400 truncate">{song.artist}</div>
                  <div className="flex gap-2 mt-1">
                    {song.displayKey && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-violet-400 font-mono">
                        {song.displayKey}
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                      {song.tempo} BPM
                    </span>
                  </div>
                </Link>

                {/* Next song hint */}
                {idx < setlistSongs.length - 1 && (
                  <Link
                    href={`/song/${setlistSongs[idx + 1].id}`}
                    className="opacity-0 group-hover:opacity-100 text-[10px] text-zinc-500 hover:text-violet-400 transition-all text-center px-2"
                    title={`Next: ${setlistSongs[idx + 1].title}`}
                  >
                    Next &rarr;
                  </Link>
                )}

                <button
                  onClick={() => removeSongFromSetlist(id, song.id)}
                  className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all text-lg w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-700"
                  title="Remove from setlist"
                >
                  &times;
                </button>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
