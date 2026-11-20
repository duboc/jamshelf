'use client';

import { useEffect, useRef, useState } from 'react';
import { useSongStore } from '@/lib/stores/song-store';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';
import { useAnimatedPresence } from '@/lib/hooks/use-animated-presence';
import { CloseIcon } from '@/components/ui/Icons';

interface VersionSummary {
  versionId: string;
  createdAt: number;
  preview: string;
}

interface VersionHistoryModalProps {
  open?: boolean;
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

function VersionHistoryModalInner({
  open,
  closing,
  songId,
  currentText,
  onClose,
  onRestored,
}: VersionHistoryModalProps & { open: boolean; closing: boolean }) {
  const { updateEntry } = useSongStore();
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadedTexts, setLoadedTexts] = useState<Record<string, string>>({});
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogA11y(open, onClose, dialogRef);

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

  const togglePreview = async (versionId: string) => {
    if (expandedId === versionId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(versionId);
    if (loadedTexts[versionId] !== undefined) return;
    setLoadingPreviewId(versionId);
    try {
      const res = await fetch(`/api/songs/${songId}/versions/${versionId}`);
      const data = await res.json();
      if (res.ok && typeof data.text === 'string') {
        setLoadedTexts((prev) => ({ ...prev, [versionId]: data.text }));
      }
    } catch {
      // Ignore preview fetch failure; user can still restore directly
    } finally {
      setLoadingPreviewId(null);
    }
  };

  const handleRestore = async (versionId: string) => {
    setRestoringId(versionId);
    setError('');
    try {
      await fetch(`/api/songs/${songId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: currentText }),
      });
      const text =
        loadedTexts[versionId] ??
        (await fetch(`/api/songs/${songId}/versions/${versionId}`).then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Falha ao carregar versão');
          return data.text as string;
        }));
      updateEntry(songId, text);
      onRestored();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível restaurar esta versão.');
      setRestoringId(null);
    }
  };

  return (
    <div
      className={`${closing ? 'gm3-backdrop-exit' : 'gm3-backdrop-enter'} fixed inset-0 bg-black/45 z-[70] flex items-center justify-center p-4`}
      onClick={closing ? undefined : onClose}
      inert={closing || undefined}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
        className={`${closing ? 'gm3-dialog-exit' : 'gm3-dialog-enter'} bg-[var(--surface)] rounded-[28px] w-full max-w-xl max-h-[82vh] flex flex-col overflow-hidden`}
        style={{ boxShadow: 'var(--shadow-md)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 bg-[var(--surface-high)]">
          <h2 id="history-modal-title" className="font-display text-lg font-bold text-[var(--ink)]">
            Histórico de versões
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="gm3-icon-btn w-9 h-9 flex items-center justify-center bg-[var(--surface2)] text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
            aria-label="Fechar"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-2.5">
          {loading && <div className="text-center text-sm text-[var(--muted)] py-8">Carregando…</div>}

          {!loading && error && (
            <div role="alert" className="text-center text-sm text-[var(--rec)] py-4">
              {error}
            </div>
          )}

          {!loading && !error && versions.length === 0 && (
            <div className="text-center text-sm text-[var(--muted)] py-8 leading-relaxed">
              Nenhuma versão anterior salva ainda. Uma cópia é guardada automaticamente quando você salva edições visuais, altera o código ChordPro, aplica uma transposição permanente ou revisa com IA.
            </div>
          )}

          {!loading &&
            versions.map((v) => {
              const isExpanded = expandedId === v.versionId;
              return (
                <div
                  key={v.versionId}
                  className="rounded-2xl bg-[var(--bg)] p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-[var(--muted)]">
                        {formatRelativeTime(v.createdAt)}
                      </div>
                      <div className="text-sm text-[var(--ink)] truncate mt-0.5">
                        {v.preview || '(vazio)'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => togglePreview(v.versionId)}
                        aria-expanded={isExpanded}
                        className="pill-btn px-3 h-8 text-xs"
                      >
                        {isExpanded ? 'Ocultar' : 'Ver prévia'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRestore(v.versionId)}
                        disabled={restoringId !== null}
                        className="pill-btn pill-btn-primary px-3.5 h-8 text-xs"
                      >
                        {restoringId === v.versionId ? 'Restaurando…' : 'Restaurar'}
                      </button>
                    </div>
                  </div>

                  <div
                    className="gm3-collapsible"
                    data-compact-slot="true"
                    data-collapsed={!isExpanded ? 'true' : undefined}
                    aria-hidden={!isExpanded || undefined}
                    inert={!isExpanded || undefined}
                  >
                    <div className="gm3-collapsible-inner">
                      <pre className="mt-2.5 max-h-48 overflow-auto rounded-xl bg-[var(--surface)] p-3 font-mono text-xs text-[var(--ink)] whitespace-pre-wrap leading-relaxed">
                        {loadingPreviewId === v.versionId
                          ? 'Carregando prévia…'
                          : loadedTexts[v.versionId] ?? v.preview}
                      </pre>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

export function VersionHistoryModal({ open = true, ...rest }: VersionHistoryModalProps) {
  const { mounted, closing } = useAnimatedPresence(open, 220);
  if (!mounted) return null;
  return <VersionHistoryModalInner open={open} closing={closing} {...rest} />;
}
