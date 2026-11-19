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
        className={`scroll-mt-4 mb-3 flex items-center justify-between gap-2.5 rounded-lg border border-[var(--line)] border-l-[3px] px-4 py-2.5 ${
          onCalibrationTap ? 'cursor-pointer hover:border-[var(--accent)]' : ''
        } ${isCalibrationTarget ? 'ring-2 ring-[var(--accent)]' : ''}`}
        style={{
          background: colors.bg,
          borderLeftColor: colors.bd,
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="font-mono text-[11px] uppercase tracking-wider font-semibold"
            style={{ color: colors.lb }}
          >
            ♪ {section.label}
          </span>
          <span className="font-mono text-[11px] text-[var(--muted)]">
            trecho instrumental
          </span>
        </div>
        {calibrationMarkSec !== null && (
          <span className="studio-chip text-[var(--tune)]">{formatMark(calibrationMarkSec)}</span>
        )}
      </div>
    );
  }

  return (
    <section
      id={`section-${sectionIdx}`}
      data-section-idx={sectionIdx}
      onClick={onCalibrationTap ? () => onCalibrationTap(sectionIdx) : undefined}
      className={`scroll-mt-4 relative rounded-lg border border-[var(--line)] border-l-[3px] ${
        isSingerMode ? 'px-5 sm:px-7 py-5 mb-4' : 'p-4 sm:p-5 mb-3.5'
      } ${onCalibrationTap ? 'cursor-pointer hover:border-[var(--accent)]' : ''} ${
        isCalibrationTarget ? 'ring-2 ring-[var(--accent)]' : ''
      }`}
      style={{
        background: colors.bg,
        borderLeftColor: colors.bd,
      }}
    >
      {editMode ? (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-[var(--line)]/70">
          <input
            type="text"
            value={section.label}
            onChange={(e) => onRenameSection?.(sectionIdx, e.target.value)}
            aria-label={`Nome da seção ${sectionIdx + 1}`}
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] bg-transparent border-b border-transparent hover:border-[var(--line)] focus:border-[var(--accent)] outline-none min-w-[100px]"
            style={{ color: colors.lb }}
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={sectionIdx === 0}
              onClick={() => onMoveSection?.(sectionIdx, 'up')}
              className="pill-btn w-7 h-7 text-xs"
              title="Mover seção para cima"
              aria-label="Mover seção para cima"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={sectionIdx >= totalSections - 1}
              onClick={() => onMoveSection?.(sectionIdx, 'down')}
              className="pill-btn w-7 h-7 text-xs"
              title="Mover seção para baixo"
              aria-label="Mover seção para baixo"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => onDuplicateSection?.(sectionIdx)}
              className="pill-btn px-2.5 h-7 text-[11px]"
              title="Duplicar esta seção"
            >
              Duplicar
            </button>
            <button
              type="button"
              disabled={totalSections <= 1}
              onClick={() => onDeleteSection?.(sectionIdx)}
              className="pill-btn px-2.5 h-7 text-[11px] text-[var(--rec)]"
              title="Remover esta seção"
            >
              Excluir
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div
            className="font-display text-[11.5px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: colors.lb }}
          >
            {section.label}
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
