'use client';

import { useEffect, useRef } from 'react';
import { extractLyricText, lineHasLyrics, parseLine } from '@/lib/utils/music';
import { PlusIcon } from '@/components/ui/Icons';

interface ChordStampSectionProps {
  sectionIdx: number;
  sectionLabel: string;
  lines: string[];
  selected: { lineIdx: number; segIdx: number } | null;
  stampChord: string | null;
  onChordSelect: (lineIdx: number, segIdx: number) => void;
  onStampAt: (lineIdx: number, charPos: number) => void;
  onAddChord: (lineIdx: number, charPos: number) => void;
}

const SELECTED_RING =
  'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)] scale-105 !bg-[var(--accent)] !text-[var(--on-accent)]';

const CHORD_CHIP_BASE =
  'rounded-lg px-2 py-0.5 text-[0.82em] font-bold leading-snug bg-[var(--primary-container)] text-[var(--on-primary-container)] font-mono select-none cursor-pointer hover:bg-[var(--accent)] hover:text-[var(--on-accent)] transition-colors';

interface WordChunk {
  text: string;
  charPos: number;
  isWord: boolean;
}

/** Splits text into clickable word tokens and non-clickable whitespace runs while tracking exact charPos offsets. */
function tokenizeWords(text: string, startOffset: number): WordChunk[] {
  const chunks: WordChunk[] = [];
  const re = /(\s+|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    chunks.push({
      text: m[0],
      charPos: startOffset + m.index,
      isWord: !/^\s+$/.test(m[0]),
    });
  }
  return chunks;
}

/**
 * Non-contentEditable touch-friendly chord placement surface ("Acordes" sub-mode).
 * Tapping words stamps the active chord in 1 tap with zero mobile keyboard bounce;
 * tapping any existing chord chip opens EditChordOverlay directly.
 */
export function ChordStampSection({
  sectionIdx,
  sectionLabel,
  lines,
  selected,
  stampChord,
  onChordSelect,
  onStampAt,
  onAddChord,
}: ChordStampSectionProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected || !rootRef.current) return;
    const btn = rootRef.current.querySelector<HTMLElement>(
      `[data-stamp-chord="${selected.lineIdx}-${selected.segIdx}"]`
    );
    if (btn) {
      const r = btn.getBoundingClientRect();
      if (typeof window !== 'undefined' && r.bottom > window.innerHeight - 310) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selected, lines]);

  const effectiveLines = lines.length ? lines : [''];
  const isEmpty = effectiveLines.every((l) => l.trim() === '');

  if (isEmpty) {
    return (
      <div
        ref={rootRef}
        data-section-stamp-idx={sectionIdx}
        aria-label={`Acordes de ${sectionLabel}`}
        className="py-1.5 flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          onClick={() => (stampChord ? onStampAt(0, 0) : onAddChord(0, 0))}
          className="pill-btn pill-btn-tonal px-3.5 h-10 text-xs font-mono font-semibold"
        >
          <PlusIcon size={14} />
          {stampChord ? `Inserir ${stampChord}` : 'Inserir acorde'}
        </button>
        <span className="text-xs text-[var(--muted)]">
          Toque para montar a progressão desta seção
        </span>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      data-section-stamp-idx={sectionIdx}
      aria-label={`Acordes de ${sectionLabel}`}
      className="space-y-1 select-none"
    >
      {effectiveLines.map((line, lineIdx) => {
        if (!line.trim()) {
          return (
            <div key={lineIdx} data-line="" className="py-1">
              <button
                type="button"
                onClick={() => (stampChord ? onStampAt(lineIdx, 0) : onAddChord(lineIdx, 0))}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--line-subtle)] px-3 h-8 text-xs font-mono text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] cursor-pointer transition-colors"
              >
                <PlusIcon size={12} />
                {stampChord ? stampChord : 'Acorde'}
              </button>
            </div>
          );
        }

        const hasLyrics = lineHasLyrics(line);
        const segs = parseLine(line);
        const endCharPos = extractLyricText(line).length;

        if (!hasLyrics) {
          return (
            <div
              key={lineIdx}
              data-line=""
              className="flex flex-wrap items-center gap-1.5 py-1.5 min-h-[2.4em]"
            >
              {segs.map((seg, segIdx) => {
                if (!seg.chord) return null;
                const isSel = selected?.lineIdx === lineIdx && selected?.segIdx === segIdx;
                return (
                  <button
                    key={segIdx}
                    type="button"
                    data-chord={seg.chord}
                    data-stamp-chord={`${lineIdx}-${segIdx}`}
                    onClick={() => onChordSelect(lineIdx, segIdx)}
                    aria-label={`Editar acorde ${seg.chord}`}
                    className={`min-w-[34px] text-center ${CHORD_CHIP_BASE} ${
                      isSel ? SELECTED_RING : ''
                    }`}
                  >
                    {seg.chord}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  stampChord ? onStampAt(lineIdx, endCharPos) : onAddChord(lineIdx, endCharPos)
                }
                aria-label={
                  stampChord
                    ? `Adicionar ${stampChord} ao final da linha ${lineIdx + 1}`
                    : `Adicionar acorde na linha ${lineIdx + 1}`
                }
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[var(--line-subtle)] px-2.5 h-8 text-xs font-mono font-semibold text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] hover:bg-[var(--primary-container)]/40 cursor-pointer transition-colors"
              >
                <PlusIcon size={12} />
                {stampChord || 'Acorde'}
              </button>
            </div>
          );
        }

        // Lyric line: render stacked chords + tappable words for 1-tap chord stamping
        let runningPos = 0;
        const renderedSegs = segs.map((seg, segIdx) => {
          const segStart = runningPos;
          runningPos += seg.text.length;
          const isSel = selected?.lineIdx === lineIdx && selected?.segIdx === segIdx;
          const chunks = tokenizeWords(seg.text, segStart);

          if (!seg.chord) {
            return (
              <span key={segIdx}>
                {chunks.map((ch, ci) =>
                  ch.isWord ? (
                    <button
                      key={ci}
                      type="button"
                      data-stamp-word={ch.charPos}
                      onClick={() =>
                        stampChord ? onStampAt(lineIdx, ch.charPos) : onAddChord(lineIdx, ch.charPos)
                      }
                      title={
                        stampChord
                          ? `Carimbar ${stampChord} sobre "${ch.text}"`
                          : `Inserir acorde sobre "${ch.text}"`
                      }
                      className="inline align-baseline rounded-md px-0.5 -mx-0.5 text-left hover:bg-[var(--primary-container)]/60 active:bg-[var(--primary-container)] cursor-pointer transition-colors"
                    >
                      {ch.text}
                    </button>
                  ) : (
                    <span key={ci}>{ch.text}</span>
                  )
                )}
              </span>
            );
          }

          // Segment with chord: pair chord chip above its first non-space word (or trailing slot)
          const firstWordIdx = chunks.findIndex((c) => c.isWord);
          const leadingSpaces = firstWordIdx > 0 ? chunks.slice(0, firstWordIdx) : [];
          const anchorChunk = firstWordIdx >= 0 ? chunks[firstWordIdx] : null;
          const restChunks = firstWordIdx >= 0 ? chunks.slice(firstWordIdx + 1) : [];

          return (
            <span key={segIdx}>
              <span className="inline-block align-baseline whitespace-nowrap">
                <button
                  type="button"
                  data-chord={seg.chord}
                  data-stamp-chord={`${lineIdx}-${segIdx}`}
                  onClick={() => onChordSelect(lineIdx, segIdx)}
                  aria-label={`Editar acorde ${seg.chord}`}
                  className={`block w-fit mb-0.5 ${CHORD_CHIP_BASE} ${
                    !anchorChunk ? 'mr-1.5 mb-[1.35em]' : ''
                  } ${isSel ? SELECTED_RING : ''}`}
                >
                  {seg.chord}
                </button>
                {leadingSpaces.map((sp, i) => (
                  <span key={`sp-${i}`}>{sp.text}</span>
                ))}
                {anchorChunk && (
                  <button
                    type="button"
                    data-stamp-word={anchorChunk.charPos}
                    onClick={() =>
                      stampChord
                        ? onStampAt(lineIdx, anchorChunk.charPos)
                        : onAddChord(lineIdx, anchorChunk.charPos)
                    }
                    title={
                      stampChord
                        ? `Carimbar ${stampChord} sobre "${anchorChunk.text}"`
                        : `Inserir acorde sobre "${anchorChunk.text}"`
                    }
                    className="inline align-baseline rounded-md px-0.5 -mx-0.5 text-left hover:bg-[var(--primary-container)]/60 active:bg-[var(--primary-container)] cursor-pointer transition-colors"
                  >
                    {anchorChunk.text}
                  </button>
                )}
              </span>
              {restChunks.map((ch, ci) =>
                ch.isWord ? (
                  <button
                    key={`r-${ci}`}
                    type="button"
                    data-stamp-word={ch.charPos}
                    onClick={() =>
                      stampChord ? onStampAt(lineIdx, ch.charPos) : onAddChord(lineIdx, ch.charPos)
                    }
                    title={
                      stampChord
                        ? `Carimbar ${stampChord} sobre "${ch.text}"`
                        : `Inserir acorde sobre "${ch.text}"`
                    }
                    className="inline align-baseline rounded-md px-0.5 -mx-0.5 text-left hover:bg-[var(--primary-container)]/60 active:bg-[var(--primary-container)] cursor-pointer transition-colors"
                  >
                    {ch.text}
                  </button>
                ) : (
                  <span key={`r-${ci}`}>{ch.text}</span>
                )
              )}
            </span>
          );
        });

        return (
          <div
            key={lineIdx}
            data-line=""
            className="whitespace-pre-wrap break-words leading-relaxed py-1 min-h-[2.35em]"
          >
            {renderedSegs}
            <button
              type="button"
              onClick={() =>
                stampChord ? onStampAt(lineIdx, endCharPos) : onAddChord(lineIdx, endCharPos)
              }
              aria-label={`Inserir acorde no fim da linha ${lineIdx + 1}`}
              title={stampChord ? `Inserir ${stampChord} no fim da linha` : 'Inserir acorde no fim da linha'}
              className="inline-flex items-center justify-center align-baseline ml-1.5 w-6 h-6 rounded-full bg-[var(--surface-high)] text-[var(--muted)] hover:bg-[var(--primary-container)] hover:text-[var(--on-primary-container)] cursor-pointer transition-colors"
            >
              <PlusIcon size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
