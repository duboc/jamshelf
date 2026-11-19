'use client';

import { useState } from 'react';

const QUICK_CUE_TAGS = [
  'Drop D',
  'Meio tom abaixo',
  'Entra bateria 4x',
  'Vocal puxa',
  'Final dobra refrão',
  'Sem pausa pra próxima',
];

interface StageNotesBarProps {
  notes: string;
  editing: boolean;
  readOnly?: boolean;
  onStartEdit?: () => void;
  onSave?: (nextNotes: string) => void;
  onCancel?: () => void;
}

function StageNotesEditor({
  initialNotes,
  onSave,
  onCancel,
}: {
  initialNotes: string;
  onSave: (nextNotes: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialNotes);

  const appendTag = (tag: string) => {
    setDraft((prev) => {
      const clean = prev.trim();
      if (!clean) return tag;
      if (clean.toLowerCase().includes(tag.toLowerCase())) return clean;
      return `${clean} · ${tag}`;
    });
  };

  return (
    <div className="flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pb-2">
      <div className="w-full rounded-[20px] bg-[var(--surface)] px-4 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="field-label text-[var(--warn-ink)] flex-shrink-0">Notas de palco</span>
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSave(draft.trim());
              if (e.key === 'Escape') onCancel();
            }}
            placeholder="Ex.: Drop D · entra só guitarra 2x · final dobra refrão..."
            className="studio-input flex-1 min-w-[200px] px-3.5 py-2 text-xs sm:text-sm"
          />
          <div className="flex items-center gap-1.5">
            {initialNotes && (
              <button
                type="button"
                onClick={() => onSave('')}
                className="pill-btn bg-[var(--bg)] px-3 h-8 text-xs text-[var(--rec)]"
                title="Remover nota de palco"
              >
                Limpar
              </button>
            )}
            <button type="button" onClick={onCancel} className="pill-btn bg-[var(--bg)] px-3.5 h-8 text-xs">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onSave(draft.trim())}
              className="pill-btn pill-btn-primary px-4 h-8 text-xs"
            >
              Salvar nota
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--muted)] mr-1">Atalhos:</span>
          {QUICK_CUE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => appendTag(tag)}
              className="px-3 py-1 rounded-full bg-[var(--surface-high)] hover:bg-[var(--primary-container)] hover:text-[var(--on-primary-container)] text-xs font-medium text-[var(--ink)] transition-colors cursor-pointer"
            >
              + {tag}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StageNotesBar({
  notes,
  editing,
  readOnly = false,
  onStartEdit,
  onSave,
  onCancel,
}: StageNotesBarProps) {
  if (editing && !readOnly && onSave && onCancel) {
    return <StageNotesEditor initialNotes={notes} onSave={onSave} onCancel={onCancel} />;
  }

  if (!notes.trim()) return null;

  return (
    <div className="flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pb-2">
      <div className="w-full rounded-2xl bg-[var(--warn-dim)] px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="studio-chip bg-[var(--warn)]/25 text-[var(--warn-ink)] font-semibold flex-shrink-0">
            Deixa
          </span>
          <p className="text-xs sm:text-[13px] font-medium text-[var(--ink)] truncate">
            {notes}
          </p>
        </div>
        {!readOnly && onStartEdit && (
          <button
            type="button"
            onClick={onStartEdit}
            className="text-xs font-medium text-[var(--warn-ink)] hover:underline flex-shrink-0 cursor-pointer"
          >
            Editar
          </button>
        )}
      </div>
    </div>
  );
}
