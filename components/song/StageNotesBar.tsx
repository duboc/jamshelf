'use client';

import { useState } from 'react';
import { useAnimatedPresence } from '@/lib/hooks/use-animated-presence';

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
    <div className="gm3-view-enter flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pb-2">
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
            aria-label="Notas de palco e deixas"
            placeholder="Ex.: Drop D · entra só guitarra 2x · final dobra refrão..."
            className="studio-input flex-1 min-w-[200px] px-3.5 py-2 text-xs sm:text-sm"
          />
          <div className="flex items-center gap-1.5">
            {initialNotes && (
              <button
                type="button"
                onClick={() => onSave('')}
                className="pill-btn bg-[var(--bg)] px-3 h-9 text-xs text-[var(--rec)]"
                title="Remover nota de palco"
              >
                Limpar
              </button>
            )}
            <button type="button" onClick={onCancel} className="pill-btn bg-[var(--bg)] px-3.5 h-9 text-xs">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onSave(draft.trim())}
              className="pill-btn pill-btn-primary px-4 h-9 text-xs"
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
              className="pill-btn h-7 px-3 text-xs bg-[var(--surface-high)] hover:bg-[var(--primary-container)] hover:text-[var(--on-primary-container)]"
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
  const [expanded, setExpanded] = useState(false);
  const showEditor = Boolean(editing && !readOnly && onSave && onCancel);
  const showBar = showEditor || Boolean(notes.trim());
  const { mounted } = useAnimatedPresence(showBar, 420);

  const isLong = notes.trim().length > 88;

  return (
    <div
      className="gm3-collapsible flex-shrink-0"
      data-compact-slot="true"
      data-collapsed={!showBar ? 'true' : undefined}
      aria-hidden={!showBar || undefined}
      inert={!showBar || undefined}
    >
      <div className="gm3-collapsible-inner">
        {mounted &&
          (showEditor && onSave && onCancel ? (
            <StageNotesEditor initialNotes={notes} onSave={onSave} onCancel={onCancel} />
          ) : notes.trim() ? (
            <div className="gm3-view-enter bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pb-2">
              <div className="w-full rounded-2xl bg-[var(--warn-dim)] px-4 py-2.5 flex items-start sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                  <span className="studio-chip bg-[var(--warn)]/25 text-[var(--warn-ink)] font-semibold flex-shrink-0">
                    Deixa
                  </span>
                  <p
                    className={`text-xs sm:text-[13px] font-medium text-[var(--ink)] leading-snug ${
                      expanded ? 'whitespace-normal' : 'line-clamp-2'
                    }`}
                  >
                    {notes}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isLong && (
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => !v)}
                      aria-expanded={expanded}
                      className="text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                    >
                      {expanded ? 'Menos' : 'Ver tudo'}
                    </button>
                  )}
                  {!readOnly && onStartEdit && (
                    <button
                      type="button"
                      onClick={onStartEdit}
                      className="text-xs font-medium text-[var(--warn-ink)] hover:underline cursor-pointer"
                    >
                      Editar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : null)}
      </div>
    </div>
  );
}
