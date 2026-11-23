'use client';

import { memo, useEffect, useState, type CSSProperties } from 'react';
import { SECTION_COLORS, isInstrumentalSection } from '@/lib/utils/music';
import type { Section } from '@/lib/types/song';
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, EditIcon, TrashIcon } from '@/components/ui/Icons';
import { ChordLine } from './ChordLine';
import { SectionEditor } from './SectionEditor';
import { ChordStampSection } from './ChordStampSection';

interface SectionBlockProps {
  section: Section;
  sectionIdx: number;
  totalSections?: number;
  onChordTap: (chord: string) => void;
  displayMode?: 'both' | 'lyrics-only' | 'chords-only';
  // Edit mode props
  editMode?: boolean;
  editSubMode?: 'text' | 'chords';
  stampChord?: string | null;
  selectedCoord?: { sectionIdx: number; lineIdx: number; segIdx: number } | null;
  onChordSelect?: (sectionIdx: number, lineIdx: number, segIdx: number) => void;
  onAddChord?: (sectionIdx: number, lineIdx: number, charPos: number) => void;
  onStampChord?: (sectionIdx: number, lineIdx: number, charPos: number) => void;
  onLinesChange?: (sectionIdx: number, lines: string[]) => void;
  onRenameSection?: (sectionIdx: number, label: string) => void;
  onDuplicateSection?: (sectionIdx: number) => void;
  onMoveSection?: (sectionIdx: number, dir: 'up' | 'down') => void;
  onDeleteSection?: (sectionIdx: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDismissOverlay?: () => void;
  domSyncKey?: number;
  // Calibration & spatial arrival cue props
  calibrationMarkSec?: number | null;
  isCalibrationTarget?: boolean;
  isArrived?: boolean;
  onCalibrationTap?: (sectionIdx: number) => void;
}

export const SectionBlock = memo(function SectionBlock({
  section,
  sectionIdx,
  totalSections = 1,
  onChordTap,
  displayMode = 'both',
  editMode = false,
  editSubMode = 'text',
  stampChord = null,
  selectedCoord = null,
  onChordSelect,
  onAddChord,
  onStampChord,
  onLinesChange,
  onRenameSection,
  onDuplicateSection,
  onMoveSection,
  onDeleteSection,
  onUndo,
  onRedo,
  onDismissOverlay,
  domSyncKey = 0,
  calibrationMarkSec = null,
  isCalibrationTarget = false,
  isArrived = false,
  onCalibrationTap,
}: SectionBlockProps) {
  const colors = SECTION_COLORS[section.type] || SECTION_COLORS.verse;
  const [labelDraft, setLabelDraft] = useState(section.label);
  useEffect(() => {
    setLabelDraft(section.label);
  }, [section.label]);

  const commitLabelDraft = () => {
    const trimmed = labelDraft.trim();
    if (!trimmed) {
      setLabelDraft(section.label);
      return;
    }
    if (trimmed !== section.label) {
      onRenameSection?.(sectionIdx, trimmed);
    }
  };

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

  const blockStyle = {
    background: colors.bg,
    '--block-idx': Math.min(sectionIdx, 3),
  } as CSSProperties;

  if (instrumentalOnly) {
    return (
      <div
        id={`section-${sectionIdx}`}
        data-section-idx={sectionIdx}
        data-section-arrived={isArrived ? 'true' : undefined}
        tabIndex={-1}
        onClick={onCalibrationTap ? () => onCalibrationTap(sectionIdx) : undefined}
        className={`gm3-card ${!editMode ? 'gm3-sheet-block' : ''} ${
          isArrived ? 'gm3-section-arrived' : ''
        } break-inside-avoid scroll-mt-4 relative mb-3 flex items-center justify-between gap-2.5 rounded-[20px] px-5 py-3 focus:outline-none ${
          onCalibrationTap ? 'cursor-pointer hover:ring-2 hover:ring-[var(--accent)]/40' : ''
        } ${isCalibrationTarget ? 'ring-2 ring-[var(--accent)]' : ''}`}
        style={blockStyle}
      >
        <div className="flex items-center gap-2">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1"
            style={{ backgroundColor: colors.pillBg }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: colors.bd }}
              aria-hidden="true"
            />
            <span
              className="font-display text-sm font-semibold"
              style={{ color: colors.lb }}
            >
              {section.label}
            </span>
          </div>
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
      data-section-arrived={isArrived ? 'true' : undefined}
      tabIndex={-1}
      onClick={onCalibrationTap ? () => onCalibrationTap(sectionIdx) : undefined}
      className={`gm3-card ${!editMode ? 'gm3-sheet-block' : ''} ${
        isArrived ? 'gm3-section-arrived' : ''
      } break-inside-avoid scroll-mt-4 relative rounded-[24px] focus:outline-none ${
        editMode
          ? 'p-4 sm:p-6 mb-3.5 sm:mb-4'
          : isSingerMode
          ? 'px-6 sm:px-8 py-6 mb-4'
          : 'p-5 sm:p-6 mb-4'
      } ${onCalibrationTap ? 'cursor-pointer hover:ring-2 hover:ring-[var(--accent)]/40' : ''} ${
        isCalibrationTarget ? 'ring-2 ring-[var(--accent)]' : ''
      }`}
      style={blockStyle}
    >
      {editMode ? (
        <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-[var(--line-subtle)]/30">
          <div
            className="group inline-flex items-center gap-2 rounded-full px-3 py-1 min-w-0 flex-1 max-w-[210px] sm:max-w-[260px]"
            style={{ backgroundColor: colors.pillBg }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: colors.bd }}
              aria-hidden="true"
            />
            <input
              type="text"
              data-section-label-idx={sectionIdx}
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={commitLabelDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setLabelDraft(section.label);
                  e.currentTarget.blur();
                }
              }}
              aria-label={`Nome da seção ${sectionIdx + 1}`}
              placeholder="Nome da seção"
              className="font-display text-base lg:text-sm font-semibold bg-transparent border-b border-transparent hover:border-[var(--line)] focus:border-[var(--accent)] focus:outline-none rounded-none min-w-0 w-full leading-tight"
              style={{ color: colors.lb }}
            />
            <EditIcon
              size={12}
              className="flex-shrink-0 pointer-events-none opacity-55 group-focus-within:opacity-100 transition-opacity"
              style={{ color: colors.lb }}
            />
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            <button
              type="button"
              disabled={sectionIdx === 0}
              onClick={() => onMoveSection?.(sectionIdx, 'up')}
              className="pill-btn bg-[var(--bg)] w-10 h-10 lg:w-9 lg:h-9"
              title={`Mover ${section.label} para cima`}
              aria-label={`Mover ${section.label} para cima`}
            >
              <ArrowUpIcon size={15} />
            </button>
            <button
              type="button"
              disabled={sectionIdx >= totalSections - 1}
              onClick={() => onMoveSection?.(sectionIdx, 'down')}
              className="pill-btn bg-[var(--bg)] w-10 h-10 lg:w-9 lg:h-9"
              title={`Mover ${section.label} para baixo`}
              aria-label={`Mover ${section.label} para baixo`}
            >
              <ArrowDownIcon size={15} />
            </button>
            <button
              type="button"
              onClick={() => onDuplicateSection?.(sectionIdx)}
              className="pill-btn bg-[var(--bg)] w-10 sm:w-auto sm:px-3 h-10 lg:h-9 text-xs"
              title={`Duplicar ${section.label}`}
              aria-label={`Duplicar ${section.label}`}
            >
              <CopyIcon size={15} className="sm:hidden" />
              <span className="hidden sm:inline">Duplicar</span>
            </button>
            <button
              type="button"
              disabled={totalSections <= 1}
              onClick={() => onDeleteSection?.(sectionIdx)}
              className="pill-btn bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--rec-dim)] hover:text-[var(--on-rec-container)] focus-visible:bg-[var(--rec-dim)] focus-visible:text-[var(--on-rec-container)] w-10 sm:w-auto sm:px-3 h-10 lg:h-9 text-xs ml-1"
              title={`Excluir ${section.label}`}
              aria-label={`Excluir ${section.label}`}
            >
              <TrashIcon size={15} className="sm:hidden" />
              <span className="hidden sm:inline">Excluir</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 mb-3">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1"
            style={{ backgroundColor: colors.pillBg }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: colors.bd }}
              aria-hidden="true"
            />
            <h2
              className="font-display text-[15px] font-semibold leading-tight"
              style={{ color: colors.lb }}
            >
              {section.label}
            </h2>
          </div>
          {calibrationMarkSec !== null && (
            <span className="studio-chip bg-[var(--tune-dim)] text-[var(--tune)]">
              {formatMark(calibrationMarkSec)}
            </span>
          )}
        </div>
      )}

      {editMode ? (
        editSubMode === 'chords' ? (
          <ChordStampSection
            sectionIdx={sectionIdx}
            sectionLabel={section.label}
            lines={section.lines}
            selected={selectedInSection}
            stampChord={stampChord}
            onChordSelect={(lineIdx, segIdx) => onChordSelect?.(sectionIdx, lineIdx, segIdx)}
            onStampAt={(lineIdx, charPos) => onStampChord?.(sectionIdx, lineIdx, charPos)}
            onAddChord={(lineIdx, charPos) => onAddChord?.(sectionIdx, lineIdx, charPos)}
          />
        ) : (
          <SectionEditor
            sectionIdx={sectionIdx}
            sectionLabel={section.label}
            lines={section.lines}
            selected={selectedInSection}
            onChordSelect={(lineIdx, segIdx) => onChordSelect?.(sectionIdx, lineIdx, segIdx)}
            onAddChord={(lineIdx, charPos) => onAddChord?.(sectionIdx, lineIdx, charPos)}
            onLinesChange={(lines) => onLinesChange?.(sectionIdx, lines)}
            onUndo={onUndo}
            onRedo={onRedo}
            onDismissOverlay={onDismissOverlay}
            domSyncKey={domSyncKey}
          />
        )
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
});
