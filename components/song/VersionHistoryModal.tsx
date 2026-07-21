'use client';

import { useEffect, useState } from 'react';
import { useSongStore } from '@/lib/stores/song-store';

interface VersionSummary {
  versionId: string;
  createdAt: number;
  preview: string;
}

interface VersionHistoryModalProps {
  songId: string;
  currentText: string;
  onClose: () => void;
  onRestored: () => void;
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function VersionHistoryModal({ songId, currentText, onClose, onRestored }: VersionHistoryModalProps) {
  const { updateEntry } = useSongStore();
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/songs/${songId}/versions`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setVersions(data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load version history');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [songId]);

  const handleRestore = async (versionId: string) => {
    setRestoringId(versionId);
    setError('');
    try {
      // Snapshot the current state first, so restoring is itself undoable.
      await fetch(`/api/songs/${songId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: currentText }),
      });
      const res = await fetch(`/api/songs/${songId}/versions/${versionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load version');
      updateEntry(songId, data.text);
      onRestored();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore this version');
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="font-bold text-zinc-100">&#128337; Version History</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white text-lg"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-2">
          {loading && <div className="text-center text-sm text-zinc-500 py-8">Loading&hellip;</div>}

          {!loading && error && (
            <div className="text-center text-sm text-red-400 py-4">{error}</div>
          )}

          {!loading && !error && versions.length === 0 && (
            <div className="text-center text-sm text-zinc-500 py-8">
              No saved versions yet — a version is created automatically whenever you apply an AI Enhance or restore an older version.
            </div>
          )}

          {!loading &&
            versions.map((v) => (
              <div
                key={v.versionId}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-zinc-950 border border-zinc-800"
              >
                <div className="min-w-0">
                  <div className="text-xs font-mono text-zinc-500">{formatRelativeTime(v.createdAt)}</div>
                  <div className="text-sm text-zinc-300 truncate">{v.preview || '(empty)'}</div>
                </div>
                <button
                  onClick={() => handleRestore(v.versionId)}
                  disabled={restoringId !== null}
                  className="text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-semibold transition-colors flex-shrink-0"
                >
                  {restoringId === v.versionId ? 'Restoring…' : 'Restore'}
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
