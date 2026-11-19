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
    <div className="flex-shrink-0 border-b border-[var(--line)] bg-[var(--surface)] px-4 sm:px-6 py-2.5">
      <div className="max-w-6xl mx-auto space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow text-[var(--warn)] flex-shrink-0">Notas de palco</span>
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
            className="studio-input flex-1 min-w-[220px] px-3 py-1.5 text-xs sm:text-sm"
          />
          <div className="flex items-center gap-1.5">
            {initialNotes && (
              <button
                type="button"
                onClick={() => onSave('')}
                className="pill-btn px-2.5 py-1 text-xs text-[var(--rec)]"
                title="Remover nota de palco"
              >
                Limpar
              </button>
            )}
            <button type="button" onClick={onCancel} className="pill-btn px-3 py-1 text-xs">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onSave(draft.trim())}
              className="pill-btn pill-btn-primary px-3.5 py-1 text-xs"
            >
              Salvar nota
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[var(--muted)] mr-1">Atalhos:</span>
          {QUICK_CUE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => appendTag(tag)}
              className="px-2 py-0.5 rounded-[4px] border border-[var(--line)] bg-[var(--surface2)] hover:border-[var(--accent)] text-[11px] font-display text-[var(--ink)] transition-colors cursor-pointer"
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
    <div className="flex-shrink-0 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--warn)_8%,var(--surface))] px-4 sm:px-6 py-2">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="studio-chip bg-[color-mix(in_srgb,var(--warn)_18%,var(--surface))] text-[var(--warn)] font-semibold flex-shrink-0">
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
            className="text-xs font-display font-medium text-[var(--accent-ink)] hover:underline flex-shrink-0 cursor-pointer"
          >
            Editar
          </button>
        )}
      </div>
    </div>
  );
}
