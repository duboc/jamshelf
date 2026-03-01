'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { processWithGemini } from '@/lib/utils/ai-import';
import type { Song } from '@/lib/types/song';

export default function AddSongPage() {
  const router = useRouter();
  const { addSong } = useSongStore();
  const [rawText, setRawText] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Song | null>(null);

  const handleProcess = async () => {
    if (!rawText.trim()) {
      setError('Please paste a chord sheet first.');
      return;
    }
    if (!apiKey.trim()) {
      setError('Please enter your Gemini API key.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const song = await processWithGemini(apiKey.trim(), rawText.trim());
      setPreview(song);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to process chord sheet');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!preview) return;
    addSong(preview);
    router.push('/');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="text-zinc-400 hover:text-white transition-colors text-sm"
          >
            &larr; Back
          </button>
          <h1 className="text-xl font-bold font-display text-zinc-100">Add Song</h1>
        </div>
      </header>

      <main className="flex-1 px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {!preview ? (
            <>
              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-600 outline-none focus:border-violet-500 transition-colors font-mono text-sm"
                />
              </div>

              {/* Raw chord sheet */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Paste chord sheet / lyrics
                </label>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={16}
                  placeholder="Paste raw chord sheet from Ultimate Guitar, etc..."
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
          ) : (
            <>
              {/* Preview */}
              <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
                <h2 className="text-xl font-bold text-zinc-100">{preview.title}</h2>
                <p className="text-zinc-400">{preview.artist}</p>
                <div className="flex gap-3 mt-3">
                  <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-violet-400 font-mono">
                    Key: {preview.displayKey}
                  </span>
                  <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 font-mono">
                    {preview.tempo} BPM
                  </span>
                  <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 font-mono">
                    {preview.timeSignature}
                  </span>
                  {preview.capo > 0 && (
                    <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-amber-400 font-mono">
                      Capo {preview.capo}
                    </span>
                  )}
                </div>
                <div className="mt-4 text-sm text-zinc-400">
                  {preview.sections.length} section{preview.sections.length !== 1 ? 's' : ''} detected
                </div>
              </div>

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
          )}
        </div>
      </main>
    </div>
  );
}
