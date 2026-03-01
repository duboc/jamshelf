'use client';

import { useState } from 'react';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { SongCard } from '@/components/song-list/SongCard';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Tab = 'all' | 'favorites' | 'setlists';

export default function Home() {
  const { getSongs, removeEntry, exportAll, importEntries } = useSongStore();
  const { setlists, createSetlist, deleteSetlist } = useSetlistStore();
  const router = useRouter();
  const songs = getSongs();

  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [newSetlistName, setNewSetlistName] = useState('');
  const [showNewSetlist, setShowNewSetlist] = useState(false);

  const baseSongs = tab === 'favorites' ? songs.filter((s) => s.favorite) : songs;

  const filtered = baseSongs.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.artist.toLowerCase().includes(search.toLowerCase())
  );

  const handleExportAll = () => {
    const cho = exportAll();
    navigator.clipboard.writeText(cho);
    alert('All songs copied to clipboard as ChordPro (.cho)!');
  };

  const handleImport = () => {
    if (!importText.trim()) {
      setImportMsg('Paste a ChordPro file first.');
      return;
    }
    const count = importEntries(importText.trim());
    if (count > 0) {
      setImportMsg(`Successfully imported ${count} song${count > 1 ? 's' : ''}!`);
      setImportText('');
      setTimeout(() => {
        setShowImport(false);
        setImportMsg('');
      }, 1500);
    } else {
      setImportMsg('Could not parse ChordPro. Make sure the file starts with {title: ...}');
    }
  };

  const handleCreateSetlist = () => {
    const name = newSetlistName.trim();
    if (!name) return;
    const sl = createSetlist(name);
    setNewSetlistName('');
    setShowNewSetlist(false);
    router.push(`/setlists/${sl.id}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold font-display tracking-tight text-violet-400">
            Jamshelf
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
            >
              Import .cho
            </button>
            <button
              onClick={handleExportAll}
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
            >
              Export All
            </button>
            <Link
              href="/add-song"
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
            >
              + Add Song
            </Link>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-zinc-800 px-6">
        <div className="max-w-3xl mx-auto flex gap-0">
          {(['all', 'favorites', 'setlists'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-violet-500 text-violet-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'favorites' ? '♥ Favorites' : t === 'setlists' ? '♪ Setlists' : 'All Songs'}
            </button>
          ))}
        </div>
      </div>

      {/* Search (songs tabs only) */}
      {tab !== 'setlists' && (
        <div className="px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <input
              type="text"
              placeholder={tab === 'favorites' ? 'Search favorites...' : 'Search songs...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-500 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 px-6 pb-8">
        <div className="max-w-3xl mx-auto">

          {/* All / Favorites tab */}
          {tab !== 'setlists' && (
            <div className="space-y-2">
              {filtered.length === 0 ? (
                <div className="text-center py-16 text-zinc-500">
                  {tab === 'favorites'
                    ? songs.filter((s) => s.favorite).length === 0
                      ? 'No favorites yet. Tap ♡ on any song to add it here.'
                      : 'No favorites match your search.'
                    : songs.length === 0
                      ? 'No songs yet. Add one to get started!'
                      : 'No songs match your search.'}
                </div>
              ) : (
                filtered.map((song) => (
                  <SongCard key={song.id} song={song} onRemove={removeEntry} />
                ))
              )}
            </div>
          )}

          {/* Setlists tab */}
          {tab === 'setlists' && (
            <div className="pt-4 space-y-3">
              {/* Create setlist */}
              {showNewSetlist ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Setlist name..."
                    value={newSetlistName}
                    onChange={(e) => setNewSetlistName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateSetlist();
                      if (e.key === 'Escape') { setShowNewSetlist(false); setNewSetlistName(''); }
                    }}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-500 transition-colors"
                  />
                  <button
                    onClick={handleCreateSetlist}
                    className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => { setShowNewSetlist(false); setNewSetlistName(''); }}
                    className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewSetlist(true)}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-zinc-700 hover:border-violet-500 text-zinc-500 hover:text-violet-400 text-sm font-medium transition-colors"
                >
                  + New Setlist
                </button>
              )}

              {setlists.length === 0 && !showNewSetlist && (
                <div className="text-center py-12 text-zinc-500">
                  No setlists yet. Create one to organize songs for a gig.
                </div>
              )}

              {setlists.map((sl) => (
                <div
                  key={sl.id}
                  className="group flex items-center gap-3 p-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all"
                >
                  <Link href={`/setlists/${sl.id}`} className="flex-1 min-w-0">
                    <div className="font-semibold text-zinc-100">{sl.name}</div>
                    <div className="text-sm text-zinc-500 mt-0.5">
                      {sl.songIds.length} song{sl.songIds.length !== 1 ? 's' : ''}
                    </div>
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm(`Delete setlist "${sl.name}"?`)) deleteSetlist(sl.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all text-lg w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-700"
                    title="Delete setlist"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Import .cho modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-700">
              <h3 className="font-bold text-zinc-100">Import ChordPro (.cho)</h3>
              <button
                onClick={() => { setShowImport(false); setImportMsg(''); setImportText(''); }}
                className="text-zinc-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-700 transition-colors"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-zinc-400">
                Paste a ChordPro file (must start with <code className="text-violet-400">{'{title: ...}'}</code>).
                You can also paste multiple songs separated by <code className="text-zinc-500">---</code>.
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={12}
                placeholder={`{title: My Song}\n{artist: Artist Name}\n{key: Am}\n\n[Verse 1]\n[Am]Lyrics here`}
                className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-600 outline-none focus:border-violet-500 transition-colors font-mono text-xs resize-y"
              />
              {importMsg && (
                <div className={`text-sm rounded-lg px-4 py-2 ${importMsg.includes('Successfully') ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
                  {importMsg}
                </div>
              )}
              <button
                onClick={handleImport}
                className="w-full py-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold transition-colors"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
