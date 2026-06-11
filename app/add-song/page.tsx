'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { processWithGemini } from '@/lib/utils/ai-import';
import { parseChordPro, patchChordProMeta } from '@/lib/utils/chordpro-parser';
import type { ChordProEntry } from '@/lib/types/song';
import { ChordSheet } from '@/components/chord-sheet/ChordSheet';

export default function AddSongPage() {
  const router = useRouter();
  const { addEntry } = useSongStore();
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ChordProEntry | null>(null);

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
    addEntry(preview);
    router.push('/');
  };

  // Parse preview entry for display metadata
  const previewSong = preview ? parseChordPro(preview.id, preview.text) : null;

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

                {/* Visual Preview */}
                <div className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden flex flex-col">
                  <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Sheet Layout Preview</h3>
                    <span className="text-[11px] text-zinc-500 font-mono">Interactive layout preview</span>
                  </div>
                  <div className="max-h-96 overflow-y-auto p-6 bg-zinc-950">
                    <ChordSheet song={previewSong} onChordTap={() => {}} />
                  </div>
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
          ) : null}
        </div>
      </main>
    </div>
  );
}
