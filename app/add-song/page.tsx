'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { processWithGemini } from '@/lib/utils/ai-import';
import { parseChordPro, patchChordProMeta } from '@/lib/utils/chordpro-parser';
import type { ChordProEntry } from '@/lib/types/song';
import type { SpotifyTrackResult } from '@/lib/spotify';
import { Breadcrumb } from '@/components/ui/Breadcrumb';

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
        <div className="max-w-3xl mx-auto space-y-1.5">
          <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Add Song' }]} />
          <h1 className="text-xl font-bold font-display text-zinc-100">Add Song</h1>
        </div>
      </header>

      <main className="flex-1 px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {!preview ? (
            <>

              {/* Raw chord sheet */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Paste chord sheet / lyrics
                </label>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={16}
                  placeholder="Paste raw chord sheet from Ultimate Guitar, CifraClub, or .cho file..."
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
              <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
                <h2 className="text-xl font-bold text-zinc-100">{previewSong.title}</h2>
                <p className="text-zinc-400">{previewSong.artist}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {previewSong.displayKey && (
                    <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-violet-400 font-mono">
                      Key: {previewSong.displayKey}
                    </span>
                  )}
                  <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 font-mono">
                    {previewSong.tempo} BPM
                  </span>
                  <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 font-mono">
                    {previewSong.timeSignature}
                  </span>
                  {previewSong.capo > 0 && (
                    <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-amber-400 font-mono">
                      Capo {previewSong.capo}
                    </span>
                  )}
                </div>
                <div className="mt-3 text-sm text-zinc-400">
                  {previewSong.sections.length} section{previewSong.sections.length !== 1 ? 's' : ''} detected
                </div>
                <pre className="mt-4 text-xs font-mono text-zinc-500 max-h-40 overflow-y-auto bg-zinc-950 rounded p-3 whitespace-pre-wrap">
                  {preview.text}
                </pre>
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
