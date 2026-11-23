'use client';

import { formatDuration } from '@/lib/utils/chordpro-parser';
import { formatSectionLabel } from '@/lib/utils/music';
import type { Section } from '@/lib/types/song';

interface CalibrationBarProps {
  open?: boolean;
  sections: Section[];
  elapsedSec: number;
  marks: (number | null)[];
  nextSectionIdx: number;
  onMarkNext: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function CalibrationBar({
  open = true,
  sections,
  elapsedSec,
  marks,
  nextSectionIdx,
  onMarkNext,
  onSave,
  onCancel,
}: CalibrationBarProps) {
  const markedCount = marks.filter((m) => m !== null).length;
  const allMarked = nextSectionIdx >= sections.length;
  const nextSection = !allMarked ? sections[nextSectionIdx] : null;

  return (
    <div
      className="gm3-collapsible flex-shrink-0"
      data-compact-slot="true"
      data-collapsed={!open ? 'true' : undefined}
      aria-hidden={!open || undefined}
      inert={!open || undefined}
    >
      <div className="gm3-collapsible-inner">
        <div className="bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pb-2">
          <div className="w-full rounded-2xl bg-[var(--tune-dim)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--rec-dot)] animate-pulse flex-shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-[var(--ink)] tabular-nums">
                    {formatDuration(elapsedSec)}
                  </span>
                  <span className="font-mono text-xs text-[var(--muted)]">
                    {markedCount}/{sections.length} seções marcadas
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] truncate">
                  Toque quando a banda entrar em cada seção (ou clique direto no bloco da seção abaixo).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {nextSection ? (
                <button
                  type="button"
                  onClick={onMarkNext}
                  className="pill-btn pill-btn-primary px-4 py-1.5 text-xs"
                  title="Atalho: Espaço ou Enter"
                >
                  Marcar &ldquo;{formatSectionLabel(nextSection.label)}&rdquo; (Espaço)
                </button>
              ) : (
                <span className="font-mono text-xs text-[var(--tune)] font-semibold">
                  ✓ Todas as seções marcadas
                </span>
              )}

              <button
                type="button"
                onClick={onSave}
                disabled={markedCount < 2}
                className="pill-btn bg-[var(--surface)] text-[var(--tune)] font-semibold px-3.5 py-1.5 text-xs"
                title={markedCount < 2 ? 'Marque pelo menos 2 seções antes de salvar' : 'Salvar tempos das seções'}
              >
                Salvar calibração
              </button>

              <button type="button" onClick={onCancel} className="pill-btn px-3 py-1.5 text-xs">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
