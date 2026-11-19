'use client';

import { SECTION_COLORS, isInstrumentalSection } from '@/lib/utils/music';
import type { Section } from '@/lib/types/song';
import { ChordLine } from './ChordLine';
import { SectionEditor } from './SectionEditor';

interface SectionBlockProps {
  section: Section;
  sectionIdx: number;
  totalSections?: number;
  onChordTap: (chord: string) => void;
  displayMode?: 'both' | 'lyrics-only' | 'chords-only';
  // Edit mode props
  editMode?: boolean;
  selectedCoord?: { sectionIdx: number; lineIdx: number; segIdx: number } | null;
  onChordSelect?: (sectionIdx: number, lineIdx: number, segIdx: number) => void;
  onAddChord?: (sectionIdx: number, lineIdx: number, charPos: number) => void;
  onLinesChange?: (sectionIdx: number, lines: string[]) => void;
  onRenameSection?: (sectionIdx: number, label: string) => void;
  onDuplicateSection?: (sectionIdx: number) => void;
  onMoveSection?: (sectionIdx: number, dir: 'up' | 'down') => void;
  onDeleteSection?: (sectionIdx: number) => void;
  // Calibration props
  calibrationMarkSec?: number | null;
  isCalibrationTarget?: boolean;
  onCalibrationTap?: (sectionIdx: number) => void;
}

export function SectionBlock({
  section,
  sectionIdx,
  totalSections = 1,
  onChordTap,
  displayMode = 'both',
  editMode = false,
  selectedCoord = null,
  onChordSelect,
  onAddChord,
  onLinesChange,
  onRenameSection,
  onDuplicateSection,
  onMoveSection,
  onDeleteSection,
  calibrationMarkSec = null,
  isCalibrationTarget = false,
  onCalibrationTap,
}: SectionBlockProps) {
  const colors = SECTION_COLORS[section.type] || SECTION_COLORS.verse;
  const selectedInSection =
    selectedCoord?.sectionIdx === sectionIdx
      ? { lineIdx: selectedCoord.lineIdx, segIdx: selectedCoord.segIdx }
      : null;

  const isSingerMode = !editMode && displayMode === 'lyrics-only';
  const instrumentalOnly = isSingerMode && isInstrumentalSection(section.lines);

  const formatMark = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  if (instrumentalOnly) {
    return (
      <div
        id={`section-${sectionIdx}`}
        data-section-idx={sectionIdx}
        onClick={onCalibrationTap ? () => onCalibrationTap(sectionIdx) : undefined}
        className={`scroll-mt-4 mb-3 flex items-center justify-between gap-2.5 rounded-[20px] px-5 py-3 ${
          onCalibrationTap ? 'cursor-pointer hover:ring-2 hover:ring-[var(--accent)]/40' : ''
        } ${isCalibrationTarget ? 'ring-2 ring-[var(--accent)]' : ''}`}
        style={{ background: colors.bg }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: colors.bd }}
            aria-hidden="true"
          />
          <span
            className="font-display text-xs font-semibold"
            style={{ color: colors.lb }}
          >
            {section.label}
          </span>
          <span className="text-xs text-[var(--muted)]">
            · trecho instrumental
          </span>
        </div>
        {calibrationMarkSec !== null && (
          <span className="studio-chip bg-[var(--tune-dim)] text-[var(--tune)]">{formatMark(calibrationMarkSec)}</span>
        )}
      </div>
    );
  }

  return (
    <section
      id={`section-${sectionIdx}`}
      data-section-idx={sectionIdx}
      onClick={onCalibrationTap ? () => onCalibrationTap(sectionIdx) : undefined}
      className={`scroll-mt-4 relative rounded-[24px] ${
        isSingerMode ? 'px-6 sm:px-8 py-6 mb-4' : 'p-5 sm:p-6 mb-4'
      } ${onCalibrationTap ? 'cursor-pointer hover:ring-2 hover:ring-[var(--accent)]/40' : ''} ${
        isCalibrationTarget ? 'ring-2 ring-[var(--accent)]' : ''
      }`}
      style={{ background: colors.bg }}
    >
      {editMode ? (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-[var(--line-subtle)]">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: colors.bd }}
              aria-hidden="true"
            />
            <input
              type="text"
              value={section.label}
              onChange={(e) => onRenameSection?.(sectionIdx, e.target.value)}
              aria-label={`Nome da seção ${sectionIdx + 1}`}
              className="font-display text-xs font-semibold bg-transparent border-b border-transparent hover:border-[var(--line)] focus:border-[var(--accent)] outline-none min-w-[100px]"
              style={{ color: colors.lb }}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={sectionIdx === 0}
              onClick={() => onMoveSection?.(sectionIdx, 'up')}
              className="pill-btn bg-[var(--bg)] w-8 h-8 text-xs"
              title="Mover seção para cima"
              aria-label="Mover seção para cima"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={sectionIdx >= totalSections - 1}
              onClick={() => onMoveSection?.(sectionIdx, 'down')}
              className="pill-btn bg-[var(--bg)] w-8 h-8 text-xs"
              title="Mover seção para baixo"
              aria-label="Mover seção para baixo"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => onDuplicateSection?.(sectionIdx)}
              className="pill-btn bg-[var(--bg)] px-3 h-8 text-xs"
              title="Duplicar esta seção"
            >
              Duplicar
            </button>
            <button
              type="button"
              disabled={totalSections <= 1}
              onClick={() => onDeleteSection?.(sectionIdx)}
              className="pill-btn bg-[var(--rec-dim)] px-3 h-8 text-xs text-[var(--on-rec-container)]"
              title="Remover esta seção"
            >
              Excluir
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: colors.bd }}
              aria-hidden="true"
            />
            <div
              className="font-display text-xs font-semibold"
              style={{ color: colors.lb }}
            >
              {section.label}
            </div>
          </div>
          {calibrationMarkSec !== null && (
            <span className="studio-chip bg-[var(--tune-dim)] text-[var(--tune)]">
              {formatMark(calibrationMarkSec)}
            </span>
          )}
        </div>
      )}

      {editMode ? (
        <SectionEditor
          lines={section.lines}
          selected={selectedInSection}
          onChordSelect={(lineIdx, segIdx) => onChordSelect?.(sectionIdx, lineIdx, segIdx)}
          onAddChord={(lineIdx, charPos) => onAddChord?.(sectionIdx, lineIdx, charPos)}
          onLinesChange={(lines) => onLinesChange?.(sectionIdx, lines)}
        />
      ) : (
        <div className={isSingerMode ? 'space-y-2' : 'space-y-1'}>
          {section.lines.map((line, lineIdx) => (
            <ChordLine
              key={lineIdx}
              line={line}
              onChordTap={onChordTap}
              displayMode={displayMode}
            />
          ))}
        </div>
      )}
    </section>
  );
}
