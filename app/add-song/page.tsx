'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { processWithGemini } from '@/lib/utils/ai-import';
import { parseChordPro, patchChordProMeta } from '@/lib/utils/chordpro-parser';
import type { ChordProEntry } from '@/lib/types/song';
import type { SpotifyTrackResult } from '@/lib/spotify';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ChordSheet } from '@/components/chord-sheet/ChordSheet';

export default function AddSongPage() {
  const router = useRouter();
  const { addEntry } = useSongStore();
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ChordProEntry | null>(null);
  const [spotifyResults, setSpotifyResults] = useState<SpotifyTrackResult[]>([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [selectedSpotifyId, setSelectedSpotifyId] = useState<string | null>(null);

  // Parse preview entry for display metadata
  const previewSong = preview ? parseChordPro(preview.id, preview.text) : null;

  // Auto-search Spotify once we have a title/artist to match
  useEffect(() => {
    if (!previewSong?.title) return;
    let cancelled = false;
    setSpotifyLoading(true);
    const query = `${previewSong.title} ${previewSong.artist}`.trim();
    fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const results: SpotifyTrackResult[] = data.results ?? [];
        setSpotifyResults(results);
        setSelectedSpotifyId(results[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setSpotifyResults([]);
      })
      .finally(() => {
        if (!cancelled) setSpotifyLoading(false);
      });
    return () => { cancelled = true; };
  }, [previewSong?.title, previewSong?.artist]);

  const updatePreviewMeta = (key: string, value: string | number) => {
    if (!preview) return;
    const newText = patchChordProMeta(preview.text, key, value);
    setPreview({
      ...preview,
      text: newText,
    });
  };

  const handleProcess = async () => {
    if (!rawText.trim()) {
      setError('Please paste a chord sheet first.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const entry = await processWithGemini(rawText.trim());
      setPreview(entry);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to process chord sheet');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!preview) return;
    const text = selectedSpotifyId
      ? patchChordProMeta(preview.text, 'spotify', selectedSpotifyId)
      : preview.text;
    addEntry({ ...preview, text });
    router.push('/');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className={`${preview ? 'max-w-5xl' : 'max-w-3xl'} mx-auto space-y-1.5 transition-all duration-300`}>
          <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Add Song' }]} />
          <h1 className="text-xl font-bold font-display text-zinc-100">Add Song</h1>
        </div>
      </header>

      <main className="flex-1 px-6 py-6">
        <div className={`${preview ? 'max-w-5xl' : 'max-w-3xl'} mx-auto space-y-6 transition-all duration-300`}>
          {!preview ? (
            <>

              {/* Raw chord sheet */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Paste chord sheet OR type song search query
                </label>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={16}
                  placeholder="Type a search query (e.g., 'Coldplay Yellow chords') or paste a raw chord sheet..."
                  className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-600 outline-none focus:border-violet-500 transition-colors font-mono text-sm resize-y"
                />
              </div>

              {error && (
                <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2">
                  {error}
                </div>
              )}

              <button
                onClick={handleProcess}
                disabled={loading}
                className="w-full py-3 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:text-violet-400 text-white font-bold transition-colors"
              >
                {loading ? 'Processing with Gemini...' : 'Process with AI'}
              </button>
            </>
          ) : previewSong ? (
            <>
              {/* Preview */}
              {/* Preview */}
              <div className="space-y-6">
                {/* Form editing preview metadata */}
                <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 space-y-4">
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Song Metadata</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Title</label>
                      <input
                        type="text"
                        value={previewSong.title}
                        onChange={(e) => updatePreviewMeta('title', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-750 text-zinc-100 focus:border-violet-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Artist</label>
                      <input
                        type="text"
                        value={previewSong.artist}
                        onChange={(e) => updatePreviewMeta('artist', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-750 text-zinc-100 focus:border-violet-500 outline-none text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Key</label>
                      <input
                        type="text"
                        value={previewSong.originalKey}
                        onChange={(e) => updatePreviewMeta('key', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-750 text-zinc-100 focus:border-violet-500 outline-none text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Capo</label>
                      <input
                        type="number"
                        value={previewSong.capo}
                        min={0}
                        max={12}
                        onChange={(e) => updatePreviewMeta('capo', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-750 text-zinc-100 focus:border-violet-500 outline-none text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Tempo (BPM)</label>
                      <input
                        type="number"
                        value={previewSong.tempo}
                        min={20}
                        max={300}
                        onChange={(e) => updatePreviewMeta('tempo', parseInt(e.target.value) || 120)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-750 text-zinc-100 focus:border-violet-500 outline-none text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Time Signature</label>
                      <select
                        value={previewSong.timeSignature}
                        onChange={(e) => updatePreviewMeta('time', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-750 text-zinc-100 focus:border-violet-500 outline-none text-sm"
                      >
                        <option value="4/4">4/4</option>
                        <option value="3/4">3/4</option>
                        <option value="6/8">6/8</option>
                        <option value="2/4">2/4</option>
                        <option value="5/4">5/4</option>
                        <option value="7/8">7/8</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Visual + Text Split Preview */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column: Raw ChordPro Editor (5 cols) */}
                  <div className="lg:col-span-5 bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                      <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Raw ChordPro Editor</h3>
                      <span className="text-[10px] text-zinc-500 font-mono">Edit raw source</span>
                    </div>
                    <textarea
                      value={preview.text}
                      onChange={(e) => setPreview({ ...preview, text: e.target.value })}
                      rows={18}
                      className="w-full p-4 bg-zinc-950 text-zinc-300 font-mono text-xs leading-relaxed outline-none focus:ring-1 focus:ring-violet-500 resize-none h-[420px] overflow-y-auto"
                      title="Edit raw ChordPro source code"
                    />
                  </div>

                  {/* Right Column: Visual Chord Sheet (7 cols) */}
                  <div className="lg:col-span-7 bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                      <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Visual Sheet Layout</h3>
                      <span className="text-[10px] text-zinc-500 font-mono">Real-time rendering</span>
                    </div>
                    <div className="h-[420px] overflow-y-auto p-4 bg-zinc-950">
                      <ChordSheet song={previewSong} onChordTap={() => {}} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Spotify match */}
              {spotifyLoading ? (
                <div className="text-sm text-zinc-500">Searching Spotify...</div>
              ) : spotifyResults.length > 0 ? (
                <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-4">
                  <div className="text-sm font-medium text-zinc-400 mb-2">Match on Spotify</div>
                  <div className="space-y-2">
                    {spotifyResults.map((track) => (
                      <button
                        key={track.id}
                        onClick={() => setSelectedSpotifyId(track.id)}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-colors ${
                          selectedSpotifyId === track.id
                            ? 'border-violet-500 bg-violet-500/10'
                            : 'border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        {track.albumArt ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={track.albumArt} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-zinc-800 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm text-zinc-100 truncate">{track.name}</div>
                          <div className="text-xs text-zinc-500 truncate">{track.artist}</div>
                        </div>
                      </button>
                    ))}
                    <button
                      onClick={() => setSelectedSpotifyId(null)}
                      className={`text-xs px-2 py-1 rounded transition-colors ${
                        selectedSpotifyId === null
                          ? 'bg-violet-600 text-white'
                          : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      No match
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex gap-3">
                <button
                  onClick={() => setPreview(null)}
                  className="flex-1 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold transition-colors"
                >
                  Add to Library
                </button>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
