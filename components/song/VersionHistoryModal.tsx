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
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} d`;
  return new Date(ts).toLocaleDateString('pt-BR');
}

export function VersionHistoryModal({
  songId,
  currentText,
  onClose,
  onRestored,
}: VersionHistoryModalProps) {
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
        if (!cancelled) setVersions(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar o histórico de versões.');
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
      await fetch(`/api/songs/${songId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: currentText }),
      });
      const res = await fetch(`/api/songs/${songId}/versions/${versionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar versão');
      updateEntry(songId, data.text);
      onRestored();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível restaurar esta versão.');
      setRestoringId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/45 z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-[var(--surface)] rounded-[28px] w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        style={{ boxShadow: 'var(--shadow-md)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 bg-[var(--surface-high)]">
          <h2 className="font-display text-lg text-[var(--ink)]">Histórico de versões</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--surface2)] text-[var(--muted)] hover:text-[var(--ink)] text-lg cursor-pointer"
            aria-label="Fechar"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-2">
          {loading && <div className="text-center text-sm text-[var(--muted)] py-8">Carregando…</div>}

          {!loading && error && (
            <div className="text-center text-sm text-[var(--rec)] py-4">{error}</div>
          )}

          {!loading && !error && versions.length === 0 && (
            <div className="text-center text-sm text-[var(--muted)] py-8 leading-relaxed">
              Nenhuma versão anterior salva ainda. Uma cópia é guardada automaticamente quando você aplica uma revisão com IA ou restaura uma versão.
            </div>
          )}

          {!loading &&
            versions.map((v) => (
              <div
                key={v.versionId}
                className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[var(--bg)]"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs text-[var(--muted)]">
                    {formatRelativeTime(v.createdAt)}
                  </div>
                  <div className="text-sm text-[var(--ink)] truncate mt-0.5">
                    {v.preview || '(vazio)'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(v.versionId)}
                  disabled={restoringId !== null}
                  className="pill-btn pill-btn-primary px-3.5 py-1.5 text-xs flex-shrink-0"
                >
                  {restoringId === v.versionId ? 'Restaurando…' : 'Restaurar'}
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
