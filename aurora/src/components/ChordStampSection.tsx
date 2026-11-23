import { useEffect, useRef } from 'react';
import { extractLyricText, lineHasLyrics, parseLine } from '@/lib/utils/music';
import { AuroraButton, UiIcon } from '../aurora/primitives';

export interface ChordStampSectionProps {
  sectionIdx: number;
  sectionLabel: string;
  lines: string[];
  fontSize: number;
  selected: { lineIdx: number; segIdx: number } | null;
  stampChord: string | null;
  lastStamped?: { sectionIdx: number; lineIdx: number; segIdx: number; seq: number } | null;
  onChordSelect: (lineIdx: number, segIdx: number, chord: string) => void;
  onStampAt: (lineIdx: number, charPos: number) => void;
  onAddChord: (lineIdx: number, charPos: number) => void;
}

const SELECTED_RING =
  'ring-2 ring-primary ring-offset-2 ring-offset-surface bg-primary text-on-primary';

interface WordChunk {
  text: string;
  charPos: number;
  isWord: boolean;
}

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
 * Touch-friendly 1-tap chord placement surface for Visual Edit ("Acordes" sub-mode).
 * Tapping words stamps the active chord immediately with zero touch-keyboard bounce;
 * tapping any existing chord chip opens VisualChordEditModal directly.
 */
export function ChordStampSection({
  sectionIdx,
  sectionLabel,
  lines,
  fontSize,
  selected,
  stampChord,
  lastStamped = null,
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
      if (typeof window !== 'undefined' && r.bottom > window.innerHeight - 300) {
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        btn.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      }
    }
  }, [selected, lines]);

  const effectiveLines = lines.length ? lines : [''];
  const isEmpty = effectiveLines.every((l) => l.trim() === '');
  const lyricScale = fontSize / 100;

  if (isEmpty) {
    return (
      <div
        ref={rootRef}
        data-section-stamp-idx={sectionIdx}
        aria-label={`Acordes de ${sectionLabel}`}
        className="py-1.5 flex flex-wrap items-center gap-2"
      >
        <AuroraButton
          color="tonal"
          icon="add"
          onClick={() => (stampChord ? onStampAt(0, 0) : onAddChord(0, 0))}
          className="font-mono"
        >
          {stampChord ? `Inserir ${stampChord}` : 'Inserir acorde'}
        </AuroraButton>
        <span className="typescale-body-sm text-on-surface-variant">
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
      className="space-y-2 select-none"
      style={{ fontSize: `${1.02 * lyricScale}rem` }}
    >
      {effectiveLines.map((line, lineIdx) => {
        if (!line.trim()) {
          return (
            <div key={lineIdx} data-line="" className="py-1">
              <button
                type="button"
                onClick={() => (stampChord ? onStampAt(lineIdx, 0) : onAddChord(lineIdx, 0))}
                className="stage-btn stage-btn-outlined border-dashed h-10 min-h-[40px] px-3 font-mono typescale-label-sm"
              >
                <UiIcon name="add" size={20} />
                {stampChord || 'Acorde'}
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
              className="flex flex-wrap items-center gap-2 py-1.5 min-h-[2.4em]"
            >
              {segs.map((seg, segIdx) => {
                if (!seg.chord) return null;
                const isSel = selected?.lineIdx === lineIdx && selected?.segIdx === segIdx;
                const isFresh =
                  lastStamped &&
                  lastStamped.sectionIdx === sectionIdx &&
                  lastStamped.lineIdx === lineIdx &&
                  lastStamped.segIdx === segIdx;
                return (
                  <button
                    key={isFresh ? `${segIdx}-pop-${lastStamped.seq}` : segIdx}
                    type="button"
                    data-chord={seg.chord}
                    data-stamp-chord={`${lineIdx}-${segIdx}`}
                    onClick={() => onChordSelect(lineIdx, segIdx, seg.chord!)}
                    aria-label={`Editar acorde ${seg.chord}`}
                    className={`chord-stamp-chip min-w-[40px] min-h-[36px] ${
                      isFresh ? 'chord-stamp-pop' : ''
                    } ${isSel ? SELECTED_RING : ''}`}
                    style={{ fontSize: `${0.84 * lyricScale}rem` }}
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
                className="stage-btn stage-btn-outlined border-dashed h-10 min-h-[40px] px-3 font-mono typescale-label-sm"
              >
                <UiIcon name="add" size={20} />
                {stampChord || 'Acorde'}
              </button>
            </div>
          );
        }

        let runningPos = 0;
        const renderedSegs = segs.map((seg, segIdx) => {
          const segStart = runningPos;
          runningPos += seg.text.length;
          const isSel = selected?.lineIdx === lineIdx && selected?.segIdx === segIdx;
          const isFresh =
            lastStamped &&
            lastStamped.sectionIdx === sectionIdx &&
            lastStamped.lineIdx === lineIdx &&
            lastStamped.segIdx === segIdx;
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
                      aria-label={
                        stampChord
                          ? `Carimbar ${stampChord} sobre "${ch.text}"`
                          : `Inserir acorde sobre "${ch.text}"`
                      }
                      title={
                        stampChord
                          ? `Carimbar ${stampChord} sobre "${ch.text}"`
                          : `Inserir acorde sobre "${ch.text}"`
                      }
                      className="edit-word-slot inline align-baseline rounded-md text-left"
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

          const firstWordIdx = chunks.findIndex((c) => c.isWord);
          const leadingSpaces = firstWordIdx > 0 ? chunks.slice(0, firstWordIdx) : [];
          const anchorChunk = firstWordIdx >= 0 ? chunks[firstWordIdx] : null;
          const restChunks = firstWordIdx >= 0 ? chunks.slice(firstWordIdx + 1) : [];

          return (
            <span key={segIdx}>
              <span className="inline-block align-baseline whitespace-nowrap">
                <button
                  key={isFresh ? `chip-${lastStamped.seq}` : 'chip'}
                  type="button"
                  data-chord={seg.chord}
                  data-stamp-chord={`${lineIdx}-${segIdx}`}
                  onClick={() => onChordSelect(lineIdx, segIdx, seg.chord!)}
                  aria-label={`Editar acorde ${seg.chord}`}
                  className={`chord-stamp-chip block w-fit mb-1.5 ${
                    !anchorChunk ? 'mr-1.5 mb-[1.35em]' : ''
                  } ${isFresh ? 'chord-stamp-pop' : ''} ${isSel ? SELECTED_RING : ''}`}
                  style={{ fontSize: `${0.84 * lyricScale}rem` }}
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
                    aria-label={
                      stampChord
                        ? `Carimbar ${stampChord} sobre "${anchorChunk.text}"`
                        : `Inserir acorde sobre "${anchorChunk.text}"`
                    }
                    title={
                      stampChord
                        ? `Carimbar ${stampChord} sobre "${anchorChunk.text}"`
                        : `Inserir acorde sobre "${anchorChunk.text}"`
                    }
                    className="edit-word-slot inline align-baseline rounded-md text-left"
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
                    aria-label={
                      stampChord
                        ? `Carimbar ${stampChord} sobre "${ch.text}"`
                        : `Inserir acorde sobre "${ch.text}"`
                    }
                    title={
                      stampChord
                        ? `Carimbar ${stampChord} sobre "${ch.text}"`
                        : `Inserir acorde sobre "${ch.text}"`
                    }
                    className="edit-word-slot inline align-baseline rounded-md text-left"
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
            className="whitespace-pre-wrap break-words leading-relaxed py-1 min-h-[2.45em]"
          >
            {renderedSegs}
            <button
              type="button"
              onClick={() =>
                stampChord ? onStampAt(lineIdx, endCharPos) : onAddChord(lineIdx, endCharPos)
              }
              aria-label={`Inserir acorde no fim da linha ${lineIdx + 1}`}
              title={
                stampChord ? `Inserir ${stampChord} no fim da linha` : 'Inserir acorde no fim da linha'
              }
              className="stamp-add-btn ml-2"
            >
              <UiIcon name="add" size={20} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
