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
    <div className="flex-1 min-h-0 overflow-auto rounded-2xl bg-[var(--bg)] p-3.5 font-mono text-xs whitespace-pre-wrap">
      {changes.map((part, i) => {
        const lines = part.value.replace(/\n$/, '').split('\n');
        const cls = part.added
          ? 'bg-[var(--tune-dim)] text-[var(--tune)]'
          : part.removed
          ? 'bg-[var(--rec)]/15 text-[var(--rec)] line-through'
          : 'text-[var(--muted)]';
        const marker = part.added ? '+' : part.removed ? '-' : ' ';
        return lines.map((line, j) => (
          <div key={`${i}-${j}`} className={cls}>
            <span className="select-none opacity-60 mr-2">{marker}</span>
            {line || '\u00A0'}
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
        if (!res.ok) throw new Error(data.error || 'Falha na revisão com IA');
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setOriginalText(data.originalText);
        setEditedText(data.enhancedText);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Algo deu errado');
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
      setError('Não foi possível salvar a versão anterior antes de aplicar. Nada foi alterado.');
      setApplying(false);
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
        className="bg-[var(--surface)] rounded-[28px] w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden"
        style={{ boxShadow: 'var(--shadow-md)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 bg-[var(--surface-high)]">
          <h2 className="font-display text-lg text-[var(--ink)]">Revisar letra e acordes com IA</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--surface2)] text-[var(--muted)] hover:text-[var(--ink)] text-lg cursor-pointer"
            aria-label="Fechar"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 min-h-0 p-5 flex flex-col gap-3">
          {loading && (
            <div className="flex-1 flex items-center justify-center text-[var(--muted)] text-sm">
              <span className="animate-pulse">Pesquisando na web e conferindo letra e acordes…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex-1 flex items-center justify-center text-[var(--rec)] text-sm text-center px-4">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              <p className="text-xs text-[var(--muted)]">
                Revise as alterações sugeridas. Você pode ajustar o texto proposto antes de aplicar, e uma cópia da versão atual fica salva no histórico.
              </p>
              <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col min-h-0">
                  <div className="field-label mb-1.5">Comparação</div>
                  <DiffView oldText={originalText} newText={editedText} />
                </div>
                <div className="flex flex-col min-h-0">
                  <div className="field-label mb-1.5">Texto proposto (editável)</div>
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    spellCheck={false}
                    className="studio-input flex-1 min-h-0 font-mono text-xs p-3 resize-none"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--line-subtle)]/40">
          <button type="button" onClick={onClose} className="pill-btn bg-[var(--bg)] px-4 h-9 text-xs">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={loading || !!error || applying || !hasChanges}
            className="pill-btn pill-btn-primary px-5 h-9 text-xs"
          >
            {applying ? 'Aplicando…' : 'Aplicar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
