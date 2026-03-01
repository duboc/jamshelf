'use client';

import { useState, useRef } from 'react';
import { useSongStore } from '@/lib/stores/song-store';
import { SongCard } from '@/components/song-list/SongCard';
import Link from 'next/link';

export default function Home() {
  const { songs, removeSong, exportAll, importSongs } = useSongStore();
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState('');

  const filtered = songs.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.artist.toLowerCase().includes(search.toLowerCase())
  );

  const handleExportAll = () => {
    const json = exportAll();
    navigator.clipboard.writeText(json);
    alert('All songs copied to clipboard as JSON!');
  };

  const handleImport = () => {
    if (!importText.trim()) {
      setImportMsg('Paste song JSON first.');
      return;
    }
    const count = importSongs(importText.trim());
    if (count > 0) {
      setImportMsg(`Successfully imported ${count} song${count > 1 ? 's' : ''}!`);
      setImportText('');
      setTimeout(() => {
        setShowImport(false);
        setImportMsg('');
      }, 1500);
    } else {
      setImportMsg('Invalid JSON. Make sure it matches the Jamshelf song format.');
    }
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
              title="Import song from JSON"
            >
              Import JSON
            </button>
            <button
              onClick={handleExportAll}
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
              title="Export all songs as JSON"
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

      {/* Search */}
      <div className="px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <input
            type="text"
            placeholder="Search songs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-500 transition-colors"
          />
        </div>
      </div>

      {/* Song list */}
      <main className="flex-1 px-6 pb-8">
        <div className="max-w-3xl mx-auto space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              {songs.length === 0
                ? 'No songs yet. Add one to get started!'
                : 'No songs match your search.'}
            </div>
          ) : (
            filtered.map((song) => (
              <SongCard key={song.id} song={song} onRemove={removeSong} />
            ))
          )}
        </div>
      </main>

      {/* Import JSON modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-700">
              <h3 className="font-bold text-zinc-100">Import Song from JSON</h3>
              <button
                onClick={() => { setShowImport(false); setImportMsg(''); setImportText(''); }}
                className="text-zinc-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-700 transition-colors"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-zinc-400">
                Paste a Jamshelf song JSON (single song or array of songs). This is the same format you get from Export.
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={12}
                placeholder='{"title": "...", "artist": "...", "sections": [...]}'
                className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-600 outline-none focus:border-violet-500 transition-colors font-mono text-xs resize-y"
              />
              {importMsg && (
                <div className={`text-sm rounded-lg px-4 py-2 ${importMsg.includes('Success') ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
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
