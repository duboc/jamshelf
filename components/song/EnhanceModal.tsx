'use client';

import { useEffect, useMemo, useState } from 'react';
import { diffLines } from 'diff';
import { useSongStore } from '@/lib/stores/song-store';

interface EnhanceModalProps {
  songId: string;
  onClose: () => void;
  onApplied: () => void;
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const changes = useMemo(() => diffLines(oldText, newText), [oldText, newText]);

  return (
    <div className="flex-1 min-h-0 overflow-auto rounded-lg bg-zinc-950 border border-zinc-800 p-3 font-mono text-xs whitespace-pre-wrap">
      {changes.map((part, i) => {
        const lines = part.value.replace(/\n$/, '').split('\n');
        const cls = part.added
          ? 'bg-green-900/30 text-green-300'
          : part.removed
          ? 'bg-red-900/30 text-red-400 line-through decoration-red-500/50'
          : 'text-zinc-500';
        const marker = part.added ? '+' : part.removed ? '-' : ' ';
        return lines.map((line, j) => (
          <div key={`${i}-${j}`} className={cls}>
            <span className="select-none opacity-60 mr-2">{marker}</span>
            {line || ' '}
          </div>
        ));
      })}
    </div>
  );
}

export function EnhanceModal({ songId, onClose, onApplied }: EnhanceModalProps) {
  const { updateEntry } = useSongStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [editedText, setEditedText] = useState('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/songs/${songId}/enhance`, { method: 'POST' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Enhance request failed');
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setOriginalText(data.originalText);
        setEditedText(data.enhancedText);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [songId]);

  const hasChanges = editedText !== originalText;

  const handleApply = async () => {
    setApplying(true);
    try {
      await fetch(`/api/songs/${songId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalText }),
      });
      updateEntry(songId, editedText);
      onApplied();
      onClose();
    } catch {
      setError('Failed to save the snapshot before applying — nothing was changed. Please try again.');
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-4xl h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="font-bold text-zinc-100">&#10024; Enhance with AI</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white text-lg"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 min-h-0 p-5 flex flex-col gap-3">
          {loading && (
            <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
              <span className="animate-pulse">&#128269; Searching the web and checking lyrics &amp; chords&hellip;</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex-1 flex items-center justify-center text-red-400 text-sm text-center px-4">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              <p className="text-xs text-zinc-500">
                Review the suggested changes below. You can edit the proposed text directly before applying — the diff updates as you type.
              </p>
              <div className="flex-1 min-h-0 grid grid-cols-2 gap-3">
                <div className="flex flex-col min-h-0">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Diff (vs. current)</div>
                  <DiffView oldText={originalText} newText={editedText} />
                </div>
                <div className="flex flex-col min-h-0">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Proposed text (editable)</div>
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    spellCheck={false}
                    className="flex-1 min-h-0 font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-200 outline-none focus:border-violet-500 resize-none"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={loading || !!error || applying || !hasChanges}
            className="text-sm px-4 py-1.5 rounded bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          >
            {applying ? 'Applying…' : 'Apply changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
