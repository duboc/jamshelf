import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { ParsedSong } from '@/lib/types/song';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useDisplayStore, type DisplayMode } from '@/lib/stores/display-store';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useAnnotationStore } from '@/lib/stores/annotation-store';
import {
  NOTE_TONES,
  NOTE_TONE_MAP,
  QUICK_NOTE_CUES,
  buildSmoothSvgPath,
  computeStrokeWidthEm,
  simplifyRawPoints,
  type AnnotateTool,
  type AnnotationAnchor,
  type InkStroke,
  type NoteShape,
  type NoteTone,
  type StrokeTool,
  type TextNote,
} from '@/lib/types/annotations';
import {
  computeSlideFillStats,
  findSlideIndexForAnchor,
  packSectionsIntoSlides,
  prepareSlideSections,
  type SlideChunk,
  type SlidePage,
  type SlideSectionMetrics,
} from '@/lib/utils/slide-pagination';
import {
  SECTION_COLORS,
  formatSectionLabel,
  isMinorKey,
  parseLine,
  shouldPreferFlats,
  transposeChord,
  transposeLine,
} from '@/lib/utils/music';
import { applyColorScheme } from '../components/AuroraShell';
import {
  AuroraButton,
  AuroraChip,
  AuroraDialog,
  AuroraIconButton,
  AuroraSegmented,
  AuroraSheet,
  UiIcon,
} from '../aurora/primitives';
import { getDisplayTitleAndArtist, getEffectiveKey } from '../utils/song-display';
import { navigate, useRoute } from '../router';

const SWIPE_MIN_DX = 48;
const SWIPE_MAX_DT = 650;
const SWIPE_DX_DY_RATIO = 1.35;
const EDGE_GUARD_PX = 16;
const KEY_DEBOUNCE_MS = 140;
const PEN_SUPPRESS_MS = 480;
const COL_GAP_PX = 14;
const CARD_GAP_PX = 10;
const HEIGHT_SAFETY_PX = 6;
const MIN_FONT_SIZE = 70;
const MAX_FONT_SIZE = 180;
const AUTO_FIT_MAX_FONT = 164;
const AUTO_FIT_MIN_FONT = 84;
const SVG_SCALE = 100;

const EMPTY_STROKES: InkStroke[] = [];
const EMPTY_NOTES: TextNote[] = [];

const TONE_LABELS_PT: Record<NoteTone, string> = {
  amber: 'Âmbar',
  primary: 'Azul',
  tune: 'Verde',
  rec: 'Vermelho',
};

function blurOnPointer(e: React.MouseEvent<HTMLButtonElement>) {
  if (e.detail > 0) {
    e.currentTarget.blur();
  }
}

function trySetPointerCapture(el: Element | null, pointerId: number) {
  if (!el) return;
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // ignore iPadOS Safari synthetic capture errors
  }
}

function isStylusTouch(touch: React.Touch): boolean {
  return 'touchType' in touch && (touch as React.Touch & { touchType?: string }).touchType === 'stylus';
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function anchorKey(sectionIdx: number, origLineIdx: number): string {
  return `${sectionIdx}:${origLineIdx}`;
}

function prefersReduced(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function ToneShapeGlyph({
  shape,
  color,
  size = 9,
}: {
  shape: NoteShape;
  color: string;
  size?: number;
}) {
  if (shape === 'diamond') {
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" className="flex-shrink-0" aria-hidden="true">
        <polygon points="5,0.6 9.4,5 5,9.4 0.6,5" fill={color} />
      </svg>
    );
  }
  if (shape === 'square') {
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" className="flex-shrink-0" aria-hidden="true">
        <rect x="1.2" y="1.2" width="7.6" height="7.6" rx="1.8" fill={color} />
      </svg>
    );
  }
  if (shape === 'triangle') {
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" className="flex-shrink-0" aria-hidden="true">
        <polygon points="5,0.8 9.3,8.8 0.7,8.8" fill={color} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" className="flex-shrink-0" aria-hidden="true">
      <circle cx="5" cy="5" r="4" fill={color} />
    </svg>
  );
}

function StrokeLayer({
  strokes,
  coordMode,
  renderKind,
}: {
  strokes: InkStroke[];
  coordMode: 'em' | 'page';
  renderKind: 'highlighter' | 'pen';
}) {
  const filtered = strokes.filter((s) => s.tool === renderKind);
  if (filtered.length === 0) return null;
  const isHi = renderKind === 'highlighter';

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-visible ${isHi ? 'z-0' : 'z-10'}`}
      aria-hidden="true"
    >
      {filtered.map((stroke) => {
        const tone = NOTE_TONE_MAP[stroke.tone] ?? NOTE_TONE_MAP.amber;
        const strokeColor = isHi ? tone.hiVar : tone.inkVar;
        const strokeWidth = computeStrokeWidthEm(stroke.tool, stroke.points) * SVG_SCALE;
        const scaled: [number, number, number][] = stroke.points.map(([x, y, p]) => [
          Math.round(x * SVG_SCALE * 10) / 10,
          Math.round(y * SVG_SCALE * 10) / 10,
          p,
        ]);

        let maxDxEm = 0.6;
        for (let i = 0; i < stroke.points.length; i++) {
          if (stroke.points[i][0] > maxDxEm) maxDxEm = stroke.points[i][0];
        }
        const safeRightReserve = Math.min(8, Math.round(maxDxEm * 10) / 10);

        const posStyle: CSSProperties =
          coordMode === 'em'
            ? {
                left: `min(calc(${Math.max(0, stroke.originX)}em), max(0px, calc(100% - ${safeRightReserve}em - 6px)))`,
                top: `${stroke.originY}em`,
              }
            : {
                left: `${stroke.originX * 100}%`,
                top: `${stroke.originY * 100}%`,
              };

        return (
          <div key={stroke.id} className="absolute pointer-events-none" style={posStyle}>
            <svg
              width="1em"
              height="1em"
              viewBox={`0 0 ${SVG_SCALE} ${SVG_SCALE}`}
              className="overflow-visible block"
            >
              <path
                data-stroke-id={stroke.id}
                data-stroke-tool={stroke.tool}
                d={buildSmoothSvgPath(scaled)}
                fill="none"
                stroke={strokeColor}
                strokeOpacity={1}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

function getNotePosStyle(note: TextNote, coordMode: 'em' | 'page'): CSSProperties {
  if (coordMode === 'page') {
    if (note.align === 'right' || note.x > 0.62) {
      return {
        right: `clamp(8px, ${(1 - note.x) * 100}%, calc(100% - 140px))`,
        top: `clamp(16px, ${note.y * 100}%, calc(100% - 36px))`,
        translate: '0 -50%',
      };
    }
    return {
      left: `clamp(8px, ${note.x * 100}%, calc(100% - 140px))`,
      top: `clamp(16px, ${note.y * 100}%, calc(100% - 36px))`,
      translate: '0 -50%',
    };
  }
  if (note.align === 'right') {
    return {
      right: `clamp(0px, calc(${Math.max(0, note.x)}em), max(0px, calc(100% - min(180px, 65%))))`,
      top: `${note.y}em`,
      translate: '0 -45%',
    };
  }
  return {
    left: `clamp(0px, calc(${Math.max(0, note.x)}em), max(0px, calc(100% - min(180px, 65%))))`,
    top: `${note.y}em`,
    translate: '0 -45%',
  };
}

function TextNoteList({
  notes,
  coordMode,
  annotateMode,
  activeTool,
  draggingNoteId,
  onStartDragNote,
  onTapNote,
}: {
  notes: TextNote[];
  coordMode: 'em' | 'page';
  annotateMode: boolean;
  activeTool: AnnotateTool;
  draggingNoteId: string | null;
  onStartDragNote: (note: TextNote, e: React.PointerEvent<HTMLButtonElement>) => void;
  onTapNote: (note: TextNote, rect: DOMRect) => void;
}) {
  if (notes.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible z-20">
      {notes.map((note) => {
        const tone = NOTE_TONE_MAP[note.tone] ?? NOTE_TONE_MAP.amber;
        const isDragging = draggingNoteId === note.id;
        const posStyle = getNotePosStyle(note, coordMode);

        if (!annotateMode) {
          return (
            <div
              key={note.id}
              role="note"
              data-note-id={note.id}
              aria-label={`Nota (${TONE_LABELS_PT[note.tone] ?? tone.label}): ${note.text}`}
              className="note-chip-enter pointer-events-none absolute inline-flex items-start gap-1.5 px-2.5 py-1 rounded-xl text-left w-max max-w-[min(240px,86%)] select-none"
              style={{
                ...posStyle,
                backgroundColor: tone.chipBg,
                color: tone.chipFg,
              }}
            >
              <span className="mt-[0.3em]">
                <ToneShapeGlyph shape={tone.shape} color={tone.dotColor} size={8} />
              </span>
              <span className="typescale-label-sm break-words whitespace-pre-wrap">{note.text}</span>
            </div>
          );
        }

        const isEraser = activeTool === 'eraser';
        return (
          <button
            key={note.id}
            type="button"
            data-note-id={note.id}
            aria-label={
              isEraser
                ? `Apagar nota: ${note.text}`
                : `Editar ou mover nota: ${note.text}`
            }
            onPointerDown={(e) => {
              e.stopPropagation();
              onStartDragNote(note, e);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (e.detail === 0) {
                onTapNote(note, e.currentTarget.getBoundingClientRect());
              }
            }}
            className={`note-chip-enter pointer-events-auto touch-none absolute inline-flex items-start gap-1.5 px-2.5 py-1.5 rounded-xl border-none text-left w-max max-w-[min(240px,86%)] select-none ${
              isEraser
                ? 'cursor-pointer ring-2 ring-inset ring-error'
                : 'cursor-grab active:cursor-grabbing'
            } ${isDragging ? 'opacity-30' : 'opacity-100'}`}
            style={{
              ...posStyle,
              backgroundColor: tone.chipBg,
              color: tone.chipFg,
            }}
          >
            <span className="mt-[0.25em]">
              <ToneShapeGlyph shape={tone.shape} color={tone.dotColor} size={8} />
            </span>
            <span className="typescale-label-sm break-words whitespace-pre-wrap">{note.text}</span>
          </button>
        );
      })}
    </div>
  );
}

function SlideChordLine({
  line,
  displayMode,
  shiftDir,
  shiftKey,
}: {
  line: string;
  displayMode: DisplayMode;
  shiftDir: 'none' | 'up' | 'down' | 'reset';
  shiftKey: string;
}) {
  if (!line.trim()) return <div className="h-[0.45em]" />;
  const segs = parseLine(line);

  if (displayMode === 'lyrics-only') {
    const lyricText = segs.map((s) => s.text).join('').replace(/^\s+/, '');
    return <p className="text-on-surface m-0 leading-[1.4]">{lyricText}</p>;
  }

  if (displayMode === 'chords-only') {
    const chords = segs.filter((s) => s.chord).map((s) => s.chord!);
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono font-bold text-primary py-0.5 leading-snug">
        {chords.map((c, ci) => (
          <span
            key={`${ci}-${shiftDir === 'none' ? 'init' : shiftKey}`}
            data-shift-dir={shiftDir === 'none' ? undefined : shiftDir}
            className="chord-settle"
          >
            {c}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="pt-[1.22em] leading-[1.36]">
      {segs.map((seg, si) => {
        const chord = seg.chord;
        const nextHasChord = Boolean(segs[si + 1]?.chord);
        const prevEndedSpace = si > 0 && /\s$/.test(segs[si - 1].text);
        if (!chord) {
          const cleanText = si === 0 ? seg.text.replace(/^\s+/, '') : seg.text;
          return (
            <span key={si} className="text-on-surface whitespace-pre-wrap">
              {cleanText}
            </span>
          );
        }
        const hasLyrics = seg.text.trim().length > 0;
        if (!hasLyrics) {
          return (
            <span
              key={si}
              className="relative inline-block leading-none mr-3"
              style={{ minWidth: `${Math.max(chord.length + 0.5, 2.5)}ch` }}
            >
              <span className="font-mono font-bold text-primary text-[0.84em] absolute left-0 bottom-[calc(100%+2px)] leading-none whitespace-nowrap">
                <span
                  key={shiftDir === 'none' ? 'init' : shiftKey}
                  data-shift-dir={shiftDir === 'none' ? undefined : shiftDir}
                  className="chord-settle"
                >
                  {chord}
                </span>
              </span>
              <span className="text-on-surface whitespace-pre leading-[1.36]">
                {seg.text || '\u00A0'}
              </span>
            </span>
          );
        }
        const wm = seg.text.match(/^(\s*)(\S+)(.*)$/);
        const rawLead = wm ? wm[1] : '';
        const leadSpace = si === 0 || prevEndedSpace ? '' : rawLead;
        const anchor = wm ? wm[2] : seg.text;
        const tail = wm ? wm[3] : '';
        const tightToNext = nextHasChord && !tail.trim();
        return (
          <span key={si}>
            {leadSpace && <span className="text-on-surface whitespace-pre">{leadSpace}</span>}
            <span
              className="relative inline-block leading-none"
              style={{
                minWidth:
                  tightToNext && anchor.length < chord.length ? `${chord.length + 0.8}ch` : undefined,
              }}
            >
              <span className="font-mono font-bold text-primary text-[0.84em] absolute left-0 bottom-[calc(100%+2px)] leading-none whitespace-nowrap">
                <span
                  key={shiftDir === 'none' ? 'init' : shiftKey}
                  data-shift-dir={shiftDir === 'none' ? undefined : shiftDir}
                  className="chord-settle"
                >
                  {chord}
                </span>
              </span>
              <span className="text-on-surface whitespace-pre leading-[1.36]">{anchor}</span>
            </span>
            {tail && <span className="text-on-surface whitespace-pre-wrap">{tail}</span>}
          </span>
        );
      })}
    </div>
  );
}

function SlideSectionCard({
  chunk,
  displayMode,
  allowColumnAlign,
  shiftDir,
  shiftKey,
  strokesByAnchor,
  notesByAnchor,
  annotateMode,
  activeTool,
  draggingNoteId,
  onStartDragNote,
  onTapNote,
}: {
  chunk: SlideChunk;
  displayMode: DisplayMode;
  allowColumnAlign: boolean;
  shiftDir: 'none' | 'up' | 'down' | 'reset';
  shiftKey: string;
  strokesByAnchor: Map<string, InkStroke[]>;
  notesByAnchor: Map<string, TextNote[]>;
  annotateMode: boolean;
  activeTool: AnnotateTool;
  draggingNoteId: string | null;
  onStartDragNote: (note: TextNote, e: React.PointerEvent<HTMLButtonElement>) => void;
  onTapNote: (note: TextNote, rect: DOMRect) => void;
}) {
  const colors = SECTION_COLORS[chunk.type] || SECTION_COLORS.verse;
  const isLyricsOnly = displayMode === 'lyrics-only';
  const isChorus = chunk.type === 'chorus';
  const labelText = formatSectionLabel(chunk.label);

  const headerKey = anchorKey(chunk.sectionIdx, -1);
  const headerStrokes = strokesByAnchor.get(headerKey) ?? EMPTY_STROKES;
  const headerNotes = notesByAnchor.get(headerKey) ?? EMPTY_NOTES;

  if (chunk.instrumentalOnly) {
    return (
      <section
        data-slide-chunk="true"
        data-section-idx={chunk.sectionIdx}
        className="stage-card relative px-4 py-2 flex items-center gap-2 flex-shrink-0 bg-surface-container-low"
      >
        <div
          data-slide-line-anchor="true"
          data-section-idx={chunk.sectionIdx}
          data-orig-line={-1}
          className="relative isolate flex items-center gap-2 w-full"
        >
          <StrokeLayer strokes={headerStrokes} coordMode="em" renderKind="highlighter" />
          <div className="relative z-[1] inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-2.5 py-0.5 whitespace-nowrap typescale-label-sm text-on-surface-variant">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: colors.bd }}
                aria-hidden="true"
              />
              {labelText}
            </span>
            <span className="typescale-body-sm text-on-surface-variant italic">
              · trecho instrumental
            </span>
          </div>
          <StrokeLayer strokes={headerStrokes} coordMode="em" renderKind="pen" />
          <TextNoteList
            notes={headerNotes}
            coordMode="em"
            annotateMode={annotateMode}
            activeTool={activeTool}
            draggingNoteId={draggingNoteId}
            onStartDragNote={onStartDragNote}
            onTapNote={onTapNote}
          />
        </div>
      </section>
    );
  }

  const flexGrow = allowColumnAlign
    ? chunk.type === 'intro' && chunk.lines.length <= 2
      ? 0.25
      : Math.max(1, chunk.lines.length)
    : 0;

  return (
    <section
      data-slide-chunk="true"
      data-section-idx={chunk.sectionIdx}
      className={`stage-card relative flex flex-col justify-start min-h-0 ${
        allowColumnAlign ? '' : 'flex-shrink-0'
      } ${isChorus ? 'stage-card-chorus' : 'bg-surface'} ${
        isLyricsOnly ? 'px-4 sm:px-5 xl:px-6 py-3 xl:py-3.5' : 'px-4 sm:px-5 xl:px-6 py-2.5 xl:py-3.5'
      }`}
      style={{ flexGrow }}
    >
      <div className="relative" data-slide-chunk-body="true">
        <div
          data-slide-line-anchor="true"
          data-section-idx={chunk.sectionIdx}
          data-orig-line={-1}
          className="relative isolate flex items-center gap-2 mb-1.5"
        >
          <StrokeLayer strokes={headerStrokes} coordMode="em" renderKind="highlighter" />
          <span
            className={`relative z-[1] inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 whitespace-nowrap typescale-label-sm ${
              isChorus
                ? 'bg-primary-container text-on-primary-container'
                : 'bg-surface-container-high text-on-surface-variant'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: colors.bd }}
              aria-hidden="true"
            />
            {labelText}
            {chunk.continuation ? ' (cont.)' : ''}
          </span>
          <StrokeLayer strokes={headerStrokes} coordMode="em" renderKind="pen" />
          <TextNoteList
            notes={headerNotes}
            coordMode="em"
            annotateMode={annotateMode}
            activeTool={activeTool}
            draggingNoteId={draggingNoteId}
            onStartDragNote={onStartDragNote}
            onTapNote={onTapNote}
          />
        </div>

        <div className={isLyricsOnly ? 'space-y-1.5' : 'space-y-0.5'}>
          {chunk.lines.map((line, idx) => {
            const origLineIdx = chunk.origLineIndices[idx] ?? chunk.startLineIdx + idx;
            const lKey = anchorKey(chunk.sectionIdx, origLineIdx);
            const lineStrokes = strokesByAnchor.get(lKey) ?? EMPTY_STROKES;
            const lineNotes = notesByAnchor.get(lKey) ?? EMPTY_NOTES;
            return (
              <div
                key={`${chunk.startLineIdx}-${origLineIdx}-${idx}`}
                data-slide-line-anchor="true"
                data-section-idx={chunk.sectionIdx}
                data-orig-line={origLineIdx}
                className="relative isolate"
              >
                <StrokeLayer strokes={lineStrokes} coordMode="em" renderKind="highlighter" />
                <div className="relative z-[1]">
                  <SlideChordLine
                    line={line}
                    displayMode={displayMode}
                    shiftDir={shiftDir}
                    shiftKey={shiftKey}
                  />
                </div>
                <StrokeLayer strokes={lineStrokes} coordMode="em" renderKind="pen" />
                <TextNoteList
                  notes={lineNotes}
                  coordMode="em"
                  annotateMode={annotateMode}
                  activeTool={activeTool}
                  draggingNoteId={draggingNoteId}
                  onStartDragNote={onStartDragNote}
                  onTapNote={onTapNote}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

type PendingPageTarget =
  | { kind: 'first'; announceSong?: string }
  | { kind: 'last'; announceSong?: string }
  | { kind: 'anchor'; sectionIdx: number; lineIdx: number }
  | null;

interface DeckLayoutState {
  songId: string;
  pages: SlidePage[];
  pageIdx: number;
  effectiveFontSize: number;
}

interface MeasureProbeState {
  key: string;
  scale: number;
  phase: 'shrink1' | 'shrink2' | 'grow1' | 'stepdown' | 'lock';
  targetPages: number;
  baselinePages: number;
  baselineGrow: number | null;
}

interface ResolvedAnchorHit {
  anchor: AnnotationAnchor;
  originX: number;
  originY: number;
  noteX: number;
  noteAlign: 'left' | 'right';
  scalePx: number;
}

interface NoteComposerState {
  mode: 'create' | 'edit';
  noteId?: string;
  anchor: AnnotationAnchor;
  x: number;
  y: number;
  align: 'left' | 'right';
  initialText: string;
  initialTone: NoteTone;
}

interface ActiveDragNoteState {
  songId: string;
  note: TextNote;
  pointerId: number;
  startX: number;
  startY: number;
  grabDx: number;
  grabDy: number;
  curX: number;
  curY: number;
  moved: boolean;
  origRect: DOMRect;
}

export function SlidesView() {
  const route = useRoute();
  const setlistId = route.params.get('setlist');
  const initialSongId = route.params.get('song');

  const entries = useSongStore((s) => s.entries);
  const songsLoaded = useSongStore((s) => s.isLoaded);
  const getSong = useSongStore((s) => s.getSong);
  const setlists = useSetlistStore((s) => s.setlists);
  const playerTranspose = usePlayerStore((s) => s.transpose);
  const playerUseFlats = usePlayerStore((s) => s.useFlats);
  const {
    displayMode,
    setDisplayMode,
    fontSize: globalFontSize,
    theme,
    setTheme,
    capoDisplay,
    setCapoDisplay,
    singleKeyShortcuts,
  } = useDisplayStore();

  const {
    bySong: annotationsBySong,
    historyBySong,
    fetchSongAnnotations,
    flushPendingSync,
    addStroke,
    removeStroke,
    addTextNote,
    updateTextNote,
    removeTextNote,
    pushManualSnapshot,
    clearSongAnnotations,
    undo: undoAnnotation,
    redo: redoAnnotation,
  } = useAnnotationStore();

  const activeSetlist = useMemo(
    () => (setlistId ? setlists.find((sl) => sl.id === setlistId) ?? null : null),
    [setlistId, setlists]
  );

  const deckSongs: ParsedSong[] = useMemo(() => {
    void entries;
    if (activeSetlist) {
      return activeSetlist.songIds
        .map((sid) => getSong(sid))
        .filter((s): s is ParsedSong => s !== null);
    }
    if (initialSongId) {
      const s = getSong(initialSongId);
      return s ? [s] : [];
    }
    return [];
  }, [entries, activeSetlist, initialSongId, getSong]);

  const initialResolvedId = useMemo(() => {
    if (initialSongId && deckSongs.some((s) => s.id === initialSongId)) return initialSongId;
    return deckSongs[0]?.id ?? '';
  }, [deckSongs, initialSongId]);

  const [activeSongId, setActiveSongId] = useState(initialResolvedId);
  useEffect(() => {
    if (!activeSongId && initialResolvedId) setActiveSongId(initialResolvedId);
  }, [activeSongId, initialResolvedId]);

  const [colsPref, setColsPref] = useState<'auto' | 1 | 2>('auto');
  const [fitMode, setFitMode] = useState<'auto' | 'manual'>('auto');
  const [manualFontSize, setManualFontSize] = useState(globalFontSize || 100);
  const [stageBox, setStageBox] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [fontsTick, setFontsTick] = useState(0);
  const [measureProbe, setMeasureProbe] = useState<MeasureProbeState | null>(null);
  const [deckLayout, setDeckLayout] = useState<DeckLayoutState>({
    songId: '',
    pages: [],
    pageIdx: 0,
    effectiveFontSize: globalFontSize || 100,
  });

  const [slideTransposeBySong, setSlideTransposeBySong] = useState<
    Record<string, { shift: number; useFlats?: boolean }>
  >(() =>
    initialResolvedId && playerTranspose !== 0
      ? { [initialResolvedId]: { shift: playerTranspose, useFlats: playerUseFlats } }
      : {}
  );

  const [deckOpen, setDeckOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [activeTool, setActiveTool] = useState<AnnotateTool>('pen');
  const [activeTone, setActiveTone] = useState<NoteTone>('amber');
  const [liveStroke, setLiveStroke] = useState<{
    tool: StrokeTool;
    tone: NoteTone;
    points: Array<{ x: number; y: number; pressure: number }>;
  } | null>(null);
  const [noteComposer, setNoteComposer] = useState<NoteComposerState | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteToneDraft, setNoteToneDraft] = useState<NoteTone>('amber');
  const [dragNote, setDragNote] = useState<ActiveDragNoteState | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [turnAnim, setTurnAnim] = useState<{ dir: 'next' | 'prev' | 'none'; seq: number }>({
    dir: 'none',
    seq: 0,
  });
  const [songBanner, setSongBanner] = useState<{ text: string; seq: number } | null>(null);
  const [undoSnackbar, setUndoSnackbar] = useState<{
    songId: string;
    message: string;
    seq: number;
  } | null>(null);
  const [liveStatus, setLiveStatus] = useState('');

  const stageInnerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const swipeLayerRef = useRef<HTMLDivElement>(null);
  const settingsWrapRef = useRef<HTMLDivElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const keyPillTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsSourceRef = useRef<'settings' | 'key'>('settings');
  const annotateToolbarRef = useRef<HTMLDivElement>(null);
  const annotateToggleRef = useRef<HTMLButtonElement>(null);
  const edgePulseLeftRef = useRef<HTMLDivElement>(null);
  const edgePulseRightRef = useRef<HTMLDivElement>(null);

  const annotateModeRef = useRef(annotateMode);
  annotateModeRef.current = annotateMode;
  const touchRef = useRef<{ x: number; y: number; t: number; horizontal: boolean; moved: boolean } | null>(null);
  const drawingRef = useRef<{
    songId: string;
    pointerId: number;
    isPencilInstant: boolean;
    tool: StrokeTool;
    tone: NoteTone;
    stageRect: DOMRect;
    startHit: ResolvedAnchorHit;
    startLocalX: number;
    startLocalY: number;
    points: Array<{ x: number; y: number; pressure: number }>;
  } | null>(null);
  const erasingRef = useRef<{
    songId: string;
    pointerId: number;
    erasedIds: Set<string>;
    preSnapshot: { strokes: InkStroke[]; notes: TextNote[] };
    didErase: boolean;
  } | null>(null);

  const lastSwipeAtRef = useRef(0);
  const lastPenActivityAtRef = useRef(0);
  const lastKeyAtRef = useRef(0);
  const liveParityRef = useRef(false);
  const pendingPageRef = useRef<PendingPageTarget>({ kind: 'first' });
  const currentAnchorRef = useRef<{ sectionIdx: number; lineIdx: number }>({
    sectionIdx: 0,
    lineIdx: 0,
  });
  const bannerTimerRef = useRef<number | null>(null);
  const snackbarTimerRef = useRef<number | null>(null);

  const announce = useCallback((msg: string) => {
    liveParityRef.current = !liveParityRef.current;
    setLiveStatus(liveParityRef.current ? msg : `${msg}\u00A0`);
  }, []);

  const showUndoToast = useCallback((songId: string, message: string, durationMs = 4500) => {
    setUndoSnackbar((prev) => ({ songId, message, seq: (prev?.seq ?? 0) + 1 }));
    if (snackbarTimerRef.current) window.clearTimeout(snackbarTimerRef.current);
    snackbarTimerRef.current = window.setTimeout(() => setUndoSnackbar(null), durationMs);
  }, []);

  const pulseEdge = useCallback((side: 'left' | 'right') => {
    if (prefersReduced()) return;
    const el = side === 'left' ? edgePulseLeftRef.current : edgePulseRightRef.current;
    if (!el) return;
    el.getAnimations().forEach((a) => a.cancel());
    el.animate(
      [
        { opacity: 0.48, transform: 'scaleX(1)' },
        { opacity: 0, transform: 'scaleX(0.6)' },
      ],
      { duration: 240, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
    );
  }, []);

  const safeSongIdx = useMemo(() => {
    const idx = deckSongs.findIndex((s) => s.id === activeSongId);
    return idx >= 0 ? idx : 0;
  }, [deckSongs, activeSongId]);

  const currentSong = deckSongs[safeSongIdx] ?? deckSongs[0] ?? null;

  // Hydrate & flush annotations
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void flushPendingSync(undefined, { keepalive: true });
      }
    };
    const onPageHide = () => {
      void flushPendingSync(undefined, { keepalive: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      void flushPendingSync(undefined, { keepalive: true });
    };
  }, [flushPendingSync]);

  useEffect(() => {
    if (!currentSong?.id) return;
    void fetchSongAnnotations(currentSong.id);
    const info = getDisplayTitleAndArtist(currentSong);
    document.title = `Slides: ${info.title} - Jamshelf`;
  }, [currentSong?.id, fetchSongAnnotations]);

  // Wake Lock
  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null;
    const wl = (
      navigator as unknown as {
        wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
      }
    ).wakeLock;
    wl?.request('screen')
      .then((s) => {
        sentinel = s;
      })
      .catch(() => {});
    return () => {
      void sentinel?.release();
    };
  }, []);

  // Dismiss Ajustes popover on outside click or Escape (restoring focus to trigger)
  useEffect(() => {
    if (!settingsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        settingsWrapRef.current &&
        !settingsWrapRef.current.contains(target) &&
        !(keyPillTriggerRef.current && keyPillTriggerRef.current.contains(target))
      ) {
        setSettingsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setSettingsOpen(false);
        const btn =
          settingsSourceRef.current === 'key'
            ? keyPillTriggerRef.current
            : settingsTriggerRef.current;
        btn?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  // Accurate transposition with per-song live override + capo shapes/sounding
  const { displayedKey, shiftedSections, activeTranspose, activeUseFlats } = useMemo(() => {
    if (!currentSong) {
      return {
        displayedKey: '',
        shiftedSections: [],
        activeTranspose: 0,
        activeUseFlats: false,
      };
    }
    const effKey = getEffectiveKey(currentSong).key;
    const override = slideTransposeBySong[currentSong.id];
    const baseTranspose = override?.shift ?? 0;
    const keyFlats =
      override?.useFlats !== undefined ? override.useFlats : shouldPreferFlats(effKey);
    const nextDisplayedKey =
      effKey && baseTranspose ? transposeChord(effKey, baseTranspose, keyFlats) : effKey;
    const chordShift =
      baseTranspose + (currentSong.capo > 0 && capoDisplay === 'shapes' ? 0 : currentSong.capo);
    const chordFlats =
      override?.useFlats !== undefined ? override.useFlats : shouldPreferFlats(nextDisplayedKey);
    const sections =
      chordShift === 0
        ? currentSong.sections
        : currentSong.sections.map((sec) => ({
            ...sec,
            lines: sec.lines.map((line) => transposeLine(line, chordShift, chordFlats)),
          }));
    return {
      displayedKey: nextDisplayedKey,
      shiftedSections: sections,
      activeTranspose: baseTranspose,
      activeUseFlats: chordFlats,
    };
  }, [currentSong, slideTransposeBySong, capoDisplay]);

  const currentSongId = currentSong?.id ?? '';
  const [shiftTracker, setShiftTracker] = useState<{
    songId: string;
    shift: number;
    flats: boolean;
    dir: 'none' | 'up' | 'down' | 'reset';
  }>({ songId: currentSongId, shift: activeTranspose, flats: activeUseFlats, dir: 'none' });
  if (shiftTracker.songId !== currentSongId) {
    setShiftTracker({
      songId: currentSongId,
      shift: activeTranspose,
      flats: activeUseFlats,
      dir: 'none',
    });
  } else if (shiftTracker.shift !== activeTranspose || shiftTracker.flats !== activeUseFlats) {
    const dir =
      activeTranspose === 0 && shiftTracker.shift !== 0
        ? 'reset'
        : activeTranspose > shiftTracker.shift
          ? 'up'
          : activeTranspose < shiftTracker.shift
            ? 'down'
            : 'reset';
    setShiftTracker({
      songId: currentSongId,
      shift: activeTranspose,
      flats: activeUseFlats,
      dir,
    });
  }

  const preparedSections = useMemo(
    () => prepareSlideSections(shiftedSections, displayMode),
    [shiftedSections, displayMode]
  );

  // Responsive 1 or 2 column layout matching main
  const canUseTwoCols =
    stageBox.width >= 900 || (stageBox.width >= 720 && stageBox.width > stageBox.height * 1.3);
  const effectiveCols: 1 | 2 = useMemo(() => {
    if (!canUseTwoCols) return 1;
    if (colsPref === 1 || colsPref === 2) return colsPref;
    return stageBox.width > stageBox.height || stageBox.width >= 960 ? 2 : 1;
  }, [canUseTwoCols, colsPref, stageBox.width, stageBox.height]);

  const colGapPx = stageBox.width >= 1280 ? 16 : COL_GAP_PX;
  const cardGapPx = stageBox.height > 0 && stageBox.height < 420 ? 8 : CARD_GAP_PX;

  const measureColWidth = useMemo(() => {
    if (stageBox.width <= 0) return 0;
    if (effectiveCols === 2) {
      return Math.max(240, Math.floor((stageBox.width - colGapPx) / 2));
    }
    return Math.max(240, Math.floor(stageBox.width));
  }, [stageBox.width, effectiveCols, colGapPx]);

  // Observe stage box dimensions (0px reflow on annotate toggle!)
  useEffect(() => {
    const el = stageInnerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w < 100 || h < 100) return;
      setStageBox((prev) => {
        if (annotateModeRef.current && prev.width > 0 && Math.abs(prev.width - w) <= 8) return prev;
        return prev.width === w && prev.height === h ? prev : { width: w, height: h };
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('orientationchange', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', update);
    };
  }, [currentSong?.id]);

  // Re-measure once webfonts settle
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.ready) return;
    let active = true;
    document.fonts.ready.then(() => {
      if (active) setFontsTick((t) => t + 1);
    });
    return () => {
      active = false;
    };
  }, []);

  const baseFontSize = fitMode === 'manual' ? manualFontSize : 100;
  const layoutKey = `${currentSong?.id ?? ''}|${displayMode}|${stageBox.width}x${stageBox.height}|${effectiveCols}|${baseFontSize}|${fitMode}|${fontsTick}`;
  const activeProbe =
    fitMode === 'auto' && measureProbe && measureProbe.key === layoutKey ? measureProbe : null;
  const mirrorFontSize = activeProbe ? activeProbe.scale : baseFontSize;

  // Deterministic multi-pass DOM-measured Auto-Fit solver (shrink tail fold + p90 width cap + grow)
  useLayoutEffect(() => {
    if (!currentSong || stageBox.height <= 0 || measureColWidth <= 0) return;
    const targetSongId = currentSong.id;

    const rafId = requestAnimationFrame(() => {
      const mirror = measureRef.current;
      if (!mirror) return;

      const lineGap = displayMode === 'lyrics-only' ? 6 : 2;
      const innerCardWidth = Math.max(160, measureColWidth - 40);
      const sectionEls = mirror.querySelectorAll<HTMLElement>('[data-measure-section]');
      const metrics: SlideSectionMetrics[] = [];
      const lineWidthRatios: number[] = [];

      sectionEls.forEach((secEl) => {
        const secRect = secEl.getBoundingClientRect();
        const linesWrap = secEl.querySelector<HTMLElement>('[data-measure-lines]');
        const lineEls = secEl.querySelectorAll<HTMLElement>('[data-measure-line]');

        const pureFullHeight = Math.ceil(secRect.height);
        if (!linesWrap || lineEls.length === 0) {
          metrics.push({ fullHeight: pureFullHeight, chromeHeight: pureFullHeight, lineHeights: [] });
          return;
        }

        const wrapRect = linesWrap.getBoundingClientRect();
        const chromeHeight = Math.ceil(secRect.height - wrapRect.height) + 2;
        const lineHeights: number[] = [];
        const textRange = typeof document !== 'undefined' ? document.createRange() : null;

        lineEls.forEach((lineEl, idx) => {
          const lr = lineEl.getBoundingClientRect();
          lineHeights.push(Math.ceil(lr.height) + (idx > 0 ? lineGap : 0));

          const inner = lineEl.firstElementChild as HTMLElement | null;
          if (inner) {
            let lineW = 0;
            if (inner.children.length > 0) {
              for (let c = 0; c < inner.children.length; c++) {
                lineW += inner.children[c].getBoundingClientRect().width;
              }
            } else if (textRange && inner.textContent && inner.textContent.trim().length > 0) {
              textRange.selectNodeContents(inner);
              lineW = textRange.getBoundingClientRect().width;
            }
            if (lineW > 0) lineWidthRatios.push(lineW / innerCardWidth);
          }
        });
        metrics.push({ fullHeight: pureFullHeight, chromeHeight, lineHeights });
      });

      let p90WidthRatio = 0;
      if (lineWidthRatios.length > 0) {
        lineWidthRatios.sort((a, b) => a - b);
        p90WidthRatio = lineWidthRatios[Math.floor((lineWidthRatios.length - 1) * 0.9)];
      }

      const usableHeight = Math.max(140, stageBox.height - HEIGHT_SAFETY_PX);
      const nextPages = packSectionsIntoSlides(
        preparedSections,
        metrics,
        usableHeight,
        effectiveCols,
        cardGapPx
      );
      const stats = computeSlideFillStats(nextPages, usableHeight, effectiveCols);
      const minAutoFont = stageBox.width >= 768 ? AUTO_FIT_MIN_FONT : 86;

      const computeGrowCandidate = () => {
        if (stageBox.height < 360 && stats.pageCount > 4) return null;
        const effectiveFill =
          stats.pageCount === 1
            ? stats.maxColFill
            : Math.min(stats.maxColFill, stats.avgColFill * 1.03);
        if (effectiveFill <= 0.05 || effectiveFill >= 0.93) return null;
        const targetFill = stats.pageCount === 1 ? 0.94 : 0.91;
        const rawVertFactor = targetFill / Math.max(0.28, effectiveFill);
        const vertFactor = 1 + (rawVertFactor - 1) * 0.88;
        const horizCap =
          p90WidthRatio > 0.05
            ? Math.min(displayMode === 'both' ? 1.54 : 1.5, 0.98 / p90WidthRatio)
            : displayMode === 'lyrics-only'
              ? 1.5
              : 1.46;
        const maxFactor = effectiveCols === 2 && stageBox.width >= 1280 ? 1.46 : 1.54;
        const boundedFactor = Math.max(1, Math.min(maxFactor, Math.min(vertFactor, horizCap)));
        const candidate = Math.min(
          AUTO_FIT_MAX_FONT,
          Math.max(baseFontSize, Math.round((baseFontSize * boundedFactor) / 2) * 2)
        );
        return candidate >= baseFontSize + 4 ? candidate : null;
      };

      if (fitMode === 'auto') {
        if (!activeProbe) {
          const pageEquiv = stats.totalCapacityFill * stats.pageCount;
          const spillPages = pageEquiv - (stats.pageCount - 1);
          const hasFoldableTail =
            stats.pageCount > 1 &&
            (stats.lastSlideTotalFill < 0.38 ||
              stats.lastSlideFill < 0.4 ||
              spillPages < 0.3);
          const baselineGrow = computeGrowCandidate();

          if (hasFoldableTail) {
            const excess = Math.max(0.05, spillPages);
            const neededRatio = (stats.pageCount - 1) / (stats.pageCount - 1 + excess * 1.25);
            const shrink1 = Math.max(
              minAutoFont,
              Math.min(94, Math.floor((baseFontSize * Math.sqrt(neededRatio)) / 2) * 2)
            );
            if (shrink1 < baseFontSize) {
              setMeasureProbe({
                key: layoutKey,
                scale: shrink1,
                phase: 'shrink1',
                targetPages: stats.pageCount - 1,
                baselinePages: stats.pageCount,
                baselineGrow,
              });
              return;
            }
          }

          if (baselineGrow) {
            setMeasureProbe({
              key: layoutKey,
              scale: baselineGrow,
              phase: 'grow1',
              targetPages: stats.pageCount,
              baselinePages: stats.pageCount,
              baselineGrow,
            });
            return;
          }
        } else if (activeProbe.phase === 'shrink1') {
          if (nextPages.length > activeProbe.targetPages) {
            if (activeProbe.scale > minAutoFont) {
              setMeasureProbe({ ...activeProbe, scale: minAutoFont, phase: 'shrink2' });
              return;
            }
            const fallbackScale = activeProbe.baselineGrow ?? baseFontSize;
            setMeasureProbe({
              ...activeProbe,
              scale: fallbackScale,
              phase: activeProbe.baselineGrow ? 'grow1' : 'lock',
              targetPages: activeProbe.baselinePages,
            });
            return;
          }
        } else if (activeProbe.phase === 'shrink2') {
          if (nextPages.length > activeProbe.targetPages) {
            const fallbackScale = activeProbe.baselineGrow ?? baseFontSize;
            setMeasureProbe({
              ...activeProbe,
              scale: fallbackScale,
              phase: activeProbe.baselineGrow ? 'grow1' : 'lock',
              targetPages: activeProbe.baselinePages,
            });
            return;
          }
        } else if (activeProbe.phase === 'grow1') {
          if (nextPages.length > activeProbe.targetPages) {
            const stepDown = Math.max(
              baseFontSize,
              Math.floor(((baseFontSize + activeProbe.scale) / 2) / 2) * 2
            );
            setMeasureProbe({
              ...activeProbe,
              scale: stepDown,
              phase: stepDown > baseFontSize ? 'stepdown' : 'lock',
            });
            return;
          }
        } else if (activeProbe.phase === 'stepdown') {
          if (nextPages.length > activeProbe.targetPages && activeProbe.scale > baseFontSize) {
            setMeasureProbe({ ...activeProbe, scale: baseFontSize, phase: 'lock' });
            return;
          }
        }
      }

      const pending = pendingPageRef.current;
      pendingPageRef.current = null;
      let resolvedPageIdx = 0;
      if (pending?.kind === 'first') {
        resolvedPageIdx = 0;
        if (pending.announceSong) {
          announce(`${pending.announceSong}, página 1 de ${nextPages.length}`);
        }
      } else if (pending?.kind === 'last') {
        resolvedPageIdx = Math.max(0, nextPages.length - 1);
        if (pending.announceSong) {
          announce(`${pending.announceSong}, página ${resolvedPageIdx + 1} de ${nextPages.length}`);
        }
      } else if (pending?.kind === 'anchor') {
        resolvedPageIdx = findSlideIndexForAnchor(nextPages, pending.sectionIdx, pending.lineIdx);
      } else {
        const anchor = currentAnchorRef.current;
        resolvedPageIdx = findSlideIndexForAnchor(nextPages, anchor.sectionIdx, anchor.lineIdx);
      }

      setDeckLayout({
        songId: targetSongId,
        pages: nextPages,
        pageIdx: resolvedPageIdx,
        effectiveFontSize: mirrorFontSize,
      });
    });

    return () => cancelAnimationFrame(rafId);
  }, [
    currentSong,
    preparedSections,
    stageBox.height,
    measureColWidth,
    effectiveCols,
    baseFontSize,
    fitMode,
    displayMode,
    fontsTick,
    layoutKey,
    activeProbe,
    mirrorFontSize,
    cardGapPx,
    stageBox.width,
    announce,
  ]);

  const isLayoutSynced = Boolean(currentSong && deckLayout.songId === currentSong.id);
  const pages = isLayoutSynced ? deckLayout.pages : [];
  const totalPages = Math.max(1, pages.length);
  const safePageIdx = isLayoutSynced
    ? Math.min(Math.max(0, deckLayout.pageIdx), totalPages - 1)
    : 0;
  const activeSlide = isLayoutSynced ? pages[safePageIdx] ?? null : null;
  const activeFontSize = isLayoutSynced ? deckLayout.effectiveFontSize : baseFontSize;

  useEffect(() => {
    if (!activeSlide) return;
    currentAnchorRef.current = {
      sectionIdx: activeSlide.anchorSectionIdx,
      lineIdx: activeSlide.anchorLineIdx,
    };
  }, [activeSlide]);

  const songAnnotations = currentSong ? annotationsBySong[currentSong.id] : undefined;
  const songStrokes = songAnnotations?.strokes ?? EMPTY_STROKES;
  const songNotes = songAnnotations?.notes ?? EMPTY_NOTES;
  const totalAnnotationCount = songStrokes.length + songNotes.length;
  const canUndo = Boolean(currentSong && (historyBySong[currentSong.id]?.past.length ?? 0) > 0);
  const canRedo = Boolean(currentSong && (historyBySong[currentSong.id]?.future.length ?? 0) > 0);

  const { strokesByAnchor, notesByAnchor, pageStrokes, pageNotes } = useMemo(() => {
    const sMap = new Map<string, InkStroke[]>();
    const nMap = new Map<string, TextNote[]>();
    const pStrokes: InkStroke[] = [];
    const pNotes: TextNote[] = [];

    const visibleLineKeys = new Set<string>();
    const visibleSectionSet = new Set<number>();
    for (const sec of preparedSections) {
      visibleSectionSet.add(sec.sectionIdx);
      visibleLineKeys.add(anchorKey(sec.sectionIdx, -1));
      for (const origIdx of sec.origLineIndices) {
        visibleLineKeys.add(anchorKey(sec.sectionIdx, origIdx));
      }
    }

    for (const s of songStrokes) {
      if (s.anchor.kind === 'section') {
        const k = anchorKey(s.anchor.sectionIdx, s.anchor.origLineIdx);
        const list = sMap.get(k);
        if (list) list.push(s);
        else sMap.set(k, [s]);
      } else if (Math.min(s.anchor.pageIdx, totalPages - 1) === safePageIdx) {
        pStrokes.push(s);
      }
    }

    for (const n of songNotes) {
      if (n.anchor.kind === 'section') {
        const exactKey = anchorKey(n.anchor.sectionIdx, n.anchor.origLineIdx);
        const resolvedKey =
          visibleLineKeys.has(exactKey) || !visibleSectionSet.has(n.anchor.sectionIdx)
            ? exactKey
            : anchorKey(n.anchor.sectionIdx, -1);
        const list = nMap.get(resolvedKey);
        if (list) list.push(n);
        else nMap.set(resolvedKey, [n]);
      } else if (Math.min(n.anchor.pageIdx, totalPages - 1) === safePageIdx) {
        pNotes.push(n);
      }
    }

    return { strokesByAnchor: sMap, notesByAnchor: nMap, pageStrokes: pStrokes, pageNotes: pNotes };
  }, [songStrokes, songNotes, preparedSections, safePageIdx, totalPages]);

  const atDeckStart = safeSongIdx === 0 && safePageIdx === 0;
  const atDeckEnd = safeSongIdx === deckSongs.length - 1 && safePageIdx >= totalPages - 1;
  const prevSong = safeSongIdx > 0 ? deckSongs[safeSongIdx - 1] : null;
  const nextSong = safeSongIdx < deckSongs.length - 1 ? deckSongs[safeSongIdx + 1] : null;
  const isLastPageOfSong = isLayoutSynced && safePageIdx >= totalPages - 1;

  const cancelActiveGestures = useCallback(() => {
    drawingRef.current = null;
    erasingRef.current = null;
    setLiveStroke(null);
    setDragNote(null);
    setNoteComposer(null);
  }, []);

  const showSongBoundaryBanner = useCallback(
    (idx: number, s: ParsedSong) => {
      const k = getEffectiveKey(s).key;
      const prefix = deckSongs.length > 1 ? `${idx + 1}/${deckSongs.length} · ` : '';
      setSongBanner((prev) => ({
        text: `${prefix}${getDisplayTitleAndArtist(s).title}${k ? ` · ${k}` : ''}`,
        seq: (prev?.seq ?? 0) + 1,
      }));
      if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = window.setTimeout(() => setSongBanner(null), 1500);
    },
    [deckSongs.length]
  );

  const goNext = useCallback(() => {
    if (!isLayoutSynced) return;
    cancelActiveGestures();
    if (safePageIdx < totalPages - 1) {
      const nextP = safePageIdx + 1;
      setDeckLayout((prev) => ({ ...prev, pageIdx: nextP }));
      setTurnAnim((prev) => ({ dir: 'next', seq: prev.seq + 1 }));
      pulseEdge('right');
      announce(`Página ${nextP + 1} de ${totalPages}`);
      return;
    }
    if (safeSongIdx < deckSongs.length - 1) {
      const targetIdx = safeSongIdx + 1;
      const targetSong = deckSongs[targetIdx];
      pendingPageRef.current = { kind: 'first', announceSong: targetSong.title };
      currentAnchorRef.current = { sectionIdx: 0, lineIdx: 0 };
      setFitMode('auto');
      setMeasureProbe(null);
      setActiveSongId(targetSong.id);
      setTurnAnim((prev) => ({ dir: 'next', seq: prev.seq + 1 }));
      pulseEdge('right');
      showSongBoundaryBanner(targetIdx, targetSong);
      return;
    }
    announce('Fim da apresentação');
  }, [
    isLayoutSynced,
    cancelActiveGestures,
    safePageIdx,
    totalPages,
    safeSongIdx,
    deckSongs,
    pulseEdge,
    announce,
    showSongBoundaryBanner,
  ]);

  const goPrev = useCallback(() => {
    if (!isLayoutSynced) return;
    cancelActiveGestures();
    if (safePageIdx > 0) {
      const prevP = safePageIdx - 1;
      setDeckLayout((prev) => ({ ...prev, pageIdx: prevP }));
      setTurnAnim((prev) => ({ dir: 'prev', seq: prev.seq + 1 }));
      pulseEdge('left');
      announce(`Página ${prevP + 1} de ${totalPages}`);
      return;
    }
    if (safeSongIdx > 0) {
      const targetIdx = safeSongIdx - 1;
      const targetSong = deckSongs[targetIdx];
      pendingPageRef.current = { kind: 'last', announceSong: targetSong.title };
      currentAnchorRef.current = { sectionIdx: 0, lineIdx: 0 };
      setFitMode('auto');
      setMeasureProbe(null);
      setActiveSongId(targetSong.id);
      setTurnAnim((prev) => ({ dir: 'prev', seq: prev.seq + 1 }));
      pulseEdge('left');
      showSongBoundaryBanner(targetIdx, targetSong);
      return;
    }
    announce('Início da apresentação');
  }, [
    isLayoutSynced,
    cancelActiveGestures,
    safePageIdx,
    totalPages,
    safeSongIdx,
    deckSongs,
    pulseEdge,
    announce,
    showSongBoundaryBanner,
  ]);

  const handleExit = useCallback(() => {
    if (currentSong) {
      void flushPendingSync(currentSong.id, { keepalive: true });
    }
    if (setlistId && !initialSongId) {
      navigate(`/setlists/${setlistId}`, { direction: 'backward' });
      return;
    }
    if (currentSong) {
      navigate(
        setlistId ? `/song/${currentSong.id}?setlist=${setlistId}` : `/song/${currentSong.id}`,
        { direction: 'backward' }
      );
      return;
    }
    navigate('/', { direction: 'backward' });
  }, [currentSong, flushPendingSync, setlistId, initialSongId]);

  const switchToCleanStage = () => {
    if (!currentSong) return;
    void flushPendingSync(currentSong.id, { keepalive: true });
    navigate(
      setlistId
        ? `/song/${currentSong.id}?setlist=${setlistId}&clean=1`
        : `/song/${currentSong.id}?clean=1`
    );
  };

  // Resolve section/line anchor for stylus/finger annotations
  const resolveAnchorAtPoint = useCallback(
    (clientX: number, clientY: number): ResolvedAnchorHit => {
      const fallbackScalePx = Math.max(10, (16 * activeFontSize) / 100);
      const stageEl = stageInnerRef.current;
      if (!stageEl) {
        return {
          anchor: { kind: 'page', pageIdx: safePageIdx },
          originX: 0.5,
          originY: 0.5,
          noteX: 0.5,
          noteAlign: 'left',
          scalePx: fallbackScalePx,
        };
      }

      const anchors = stageEl.querySelectorAll<HTMLElement>('[data-slide-line-anchor="true"]');
      let directEl: HTMLElement | null = null;
      for (let i = 0; i < anchors.length; i++) {
        const el = anchors[i];
        const r = el.getBoundingClientRect();
        if (
          clientX >= r.left - 12 &&
          clientX <= r.right + 12 &&
          clientY >= r.top - 4 &&
          clientY <= r.bottom + 4
        ) {
          directEl = el;
          break;
        }
      }

      if (!directEl) {
        const chunks = stageEl.querySelectorAll<HTMLElement>('[data-slide-chunk="true"]');
        let nearestCard: HTMLElement | null = null;
        let nearestDist = Infinity;
        for (let i = 0; i < chunks.length; i++) {
          const cr = chunks[i].getBoundingClientRect();
          const dx = Math.max(cr.left - clientX, 0, clientX - cr.right);
          const dy = Math.max(cr.top - clientY, 0, clientY - cr.bottom);
          const dist = Math.hypot(dx, dy);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestCard = chunks[i];
          }
        }
        if (nearestCard) {
          const cardAnchors = nearestCard.querySelectorAll<HTMLElement>('[data-slide-line-anchor="true"]');
          let bestDist = Infinity;
          cardAnchors.forEach((a) => {
            const ar = a.getBoundingClientRect();
            const d = Math.abs(clientY - (ar.top + ar.bottom) / 2);
            if (d < bestDist) {
              bestDist = d;
              directEl = a;
            }
          });
        }
      }

      if (directEl) {
        const r = directEl.getBoundingClientRect();
        const computedFont = parseFloat(getComputedStyle(directEl).fontSize);
        const scalePx = Number.isFinite(computedFont) && computedFont >= 8 ? computedFont : fallbackScalePx;
        const sectionIdx = Number(directEl.getAttribute('data-section-idx') ?? 0);
        const origLineIdx = Number(directEl.getAttribute('data-orig-line') ?? -1);
        const relXFrac = (clientX - r.left) / Math.max(1, r.width);
        const noteAlign: 'left' | 'right' = relXFrac > 0.58 ? 'right' : 'left';
        const leftEm = round3(Math.max(0, (clientX - r.left) / scalePx));
        const rightEm = round3(Math.max(0, (r.right - clientX) / scalePx));
        const maxYEm = Math.max(1.2, r.height / scalePx + 0.5);
        const clampedY = round3(Math.max(-0.25, Math.min(maxYEm, (clientY - r.top) / scalePx)));
        return {
          anchor: { kind: 'section', sectionIdx, origLineIdx },
          originX: leftEm,
          originY: clampedY,
          noteX: noteAlign === 'right' ? rightEm : leftEm,
          noteAlign,
          scalePx,
        };
      }

      const stageRect = stageEl.getBoundingClientRect();
      const xFrac = round3(Math.max(0.02, Math.min(0.98, (clientX - stageRect.left) / Math.max(1, stageRect.width))));
      const yFrac = round3(Math.max(0.02, Math.min(0.98, (clientY - stageRect.top) / Math.max(1, stageRect.height))));
      return {
        anchor: { kind: 'page', pageIdx: safePageIdx },
        originX: xFrac,
        originY: yFrac,
        noteX: xFrac,
        noteAlign: xFrac > 0.62 ? 'right' : 'left',
        scalePx: fallbackScalePx,
      };
    },
    [activeFontSize, safePageIdx]
  );

  // Geometric batched eraser sweep across strokes and notes
  const eraseAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      const er = erasingRef.current;
      if (!er || !stageInnerRef.current) return;
      const root = stageInnerRef.current;

      const noteEls = root.querySelectorAll<HTMLElement>('[data-note-id]');
      for (let i = 0; i < noteEls.length; i++) {
        const el = noteEls[i];
        const id = el.getAttribute('data-note-id');
        if (!id || er.erasedIds.has(id)) continue;
        const r = el.getBoundingClientRect();
        if (clientX >= r.left - 6 && clientX <= r.right + 6 && clientY >= r.top - 6 && clientY <= r.bottom + 6) {
          er.erasedIds.add(id);
          er.didErase = true;
          removeTextNote(er.songId, id, { skipHistory: true });
          announce('Nota apagada');
          return;
        }
      }

      const pathEls = root.querySelectorAll<SVGPathElement>('path[data-stroke-id]');
      for (let i = 0; i < pathEls.length; i++) {
        const pathEl = pathEls[i];
        const id = pathEl.getAttribute('data-stroke-id');
        if (!id || er.erasedIds.has(id)) continue;
        const hitRadius = pathEl.getAttribute('data-stroke-tool') === 'highlighter' ? 22 : 16;
        const r = pathEl.getBoundingClientRect();
        if (
          clientX < r.left - hitRadius ||
          clientX > r.right + hitRadius ||
          clientY < r.top - hitRadius ||
          clientY > r.bottom + hitRadius
        ) {
          continue;
        }
        const ctm = pathEl.getScreenCTM();
        if (!ctm) continue;
        const totalLen = pathEl.getTotalLength();
        const steps = Math.max(2, Math.min(80, Math.ceil(totalLen / 18)));
        for (let s = 0; s <= steps; s++) {
          const pt = pathEl.getPointAtLength((totalLen * s) / steps);
          const sx = pt.x * ctm.a + pt.y * ctm.c + ctm.e;
          const sy = pt.x * ctm.b + pt.y * ctm.d + ctm.f;
          if (Math.hypot(clientX - sx, clientY - sy) <= hitRadius) {
            er.erasedIds.add(id);
            er.didErase = true;
            removeStroke(er.songId, id, { skipHistory: true });
            announce('Traço apagado');
            return;
          }
        }
      }
    },
    [removeTextNote, removeStroke, announce]
  );

  // Pointer handlers for Annotate Mode + Apple Pencil instant draw + palm rejection
  const handleStagePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!currentSong || deckOpen || noteComposer || confirmClearOpen) return;
    if (e.button > 0) return;
    if (drawingRef.current || erasingRef.current || dragNote) return;

    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('button, a, textarea, input, select, [role="dialog"]')) return;

    const isApplePencil = e.pointerType === 'pen';
    if (isApplePencil) {
      lastPenActivityAtRef.current = Date.now();
    } else if (Date.now() - lastPenActivityAtRef.current < 320) {
      return;
    }

    if (!annotateMode && !isApplePencil) return;
    const stageEl = stageInnerRef.current;
    if (!stageEl) return;
    const stageRect = stageEl.getBoundingClientRect();
    const effectiveTool: AnnotateTool = !annotateMode && isApplePencil ? 'pen' : activeTool;

    if (effectiveTool === 'text') {
      e.preventDefault();
      const hit = resolveAnchorAtPoint(e.clientX, e.clientY);
      setNoteDraft('');
      setNoteToneDraft(activeTone);
      setNoteComposer({
        mode: 'create',
        anchor: hit.anchor,
        x: hit.noteX,
        y: hit.originY,
        align: hit.noteAlign,
        initialText: '',
        initialTone: activeTone,
      });
      return;
    }

    if (effectiveTool === 'eraser') {
      e.preventDefault();
      erasingRef.current = {
        songId: currentSong.id,
        pointerId: e.pointerId,
        erasedIds: new Set<string>(),
        preSnapshot: { strokes: songStrokes, notes: songNotes },
        didErase: false,
      };
      trySetPointerCapture(e.currentTarget, e.pointerId);
      eraseAtPoint(e.clientX, e.clientY);
      return;
    }

    e.preventDefault();
    const startHit = resolveAnchorAtPoint(e.clientX, e.clientY);
    const localX = e.clientX - stageRect.left;
    const localY = e.clientY - stageRect.top;
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    const initialPts = [{ x: localX, y: localY, pressure }];
    drawingRef.current = {
      songId: currentSong.id,
      pointerId: e.pointerId,
      isPencilInstant: !annotateMode && isApplePencil,
      tool: effectiveTool,
      tone: activeTone,
      stageRect,
      startHit,
      startLocalX: localX,
      startLocalY: localY,
      points: initialPts,
    };
    setLiveStroke({ tool: effectiveTool, tone: activeTone, points: initialPts });
    trySetPointerCapture(e.currentTarget, e.pointerId);
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (dragNote && dragNote.pointerId === e.pointerId) {
      e.preventDefault();
      const moved = dragNote.moved || Math.hypot(e.clientX - dragNote.startX, e.clientY - dragNote.startY) > 6;
      setDragNote((prev) => (prev ? { ...prev, curX: e.clientX, curY: e.clientY, moved } : null));
      return;
    }
    if (erasingRef.current && erasingRef.current.pointerId === e.pointerId) {
      e.preventDefault();
      eraseAtPoint(e.clientX, e.clientY);
      return;
    }
    const draw = drawingRef.current;
    if (!draw || draw.pointerId !== e.pointerId) return;
    e.preventDefault();
    if (e.pointerType === 'pen') lastPenActivityAtRef.current = Date.now();
    const localX = e.clientX - draw.stageRect.left;
    const localY = e.clientY - draw.stageRect.top;
    const last = draw.points[draw.points.length - 1];
    if (last && Math.hypot(localX - last.x, localY - last.y) < 1.5) return;
    draw.points.push({ x: localX, y: localY, pressure: e.pressure > 0 ? e.pressure : 0.5 });
    setLiveStroke({ tool: draw.tool, tone: draw.tone, points: [...draw.points] });
  };

  const finishStagePointer = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    if (e.pointerType === 'pen') lastPenActivityAtRef.current = Date.now();

    if (dragNote && dragNote.pointerId === e.pointerId) {
      const finished = dragNote;
      setDragNote(null);
      if (!cancelled) {
        if (finished.moved) {
          const dropLeft = e.clientX - finished.grabDx;
          const dropCenterY = e.clientY - finished.grabDy + finished.origRect.height / 2;
          const dropProbeX =
            finished.note.align === 'right' ? dropLeft + finished.origRect.width : dropLeft;
          const hit = resolveAnchorAtPoint(dropProbeX, dropCenterY);
          updateTextNote(finished.songId, finished.note.id, {
            anchor: hit.anchor,
            x: hit.noteX,
            y: hit.originY,
            align: hit.noteAlign,
          });
          announce('Nota reposicionada');
        } else {
          setNoteDraft(finished.note.text);
          setNoteToneDraft(finished.note.tone);
          setNoteComposer({
            mode: 'edit',
            noteId: finished.note.id,
            anchor: finished.note.anchor,
            x: finished.note.x,
            y: finished.note.y,
            align: finished.note.align ?? 'left',
            initialText: finished.note.text,
            initialTone: finished.note.tone,
          });
        }
      }
      return;
    }

    if (erasingRef.current && erasingRef.current.pointerId === e.pointerId) {
      const fin = erasingRef.current;
      erasingRef.current = null;
      if (fin.didErase) pushManualSnapshot(fin.songId, fin.preSnapshot);
      return;
    }

    const draw = drawingRef.current;
    if (!draw || draw.pointerId !== e.pointerId) return;
    drawingRef.current = null;
    setLiveStroke(null);
    if (cancelled || draw.points.length === 0) return;

    const simplified = simplifyRawPoints(draw.points, 2.2);
    const scalePx = draw.startHit.scalePx;
    const relPoints: [number, number, number][] = simplified.map((pt) => [
      round3((pt.x - draw.startLocalX) / scalePx),
      round3((pt.y - draw.startLocalY) / scalePx),
      round3(pt.pressure),
    ]);

    addStroke(draw.songId, {
      id: makeId('ink'),
      tool: draw.tool,
      tone: draw.tone,
      anchor: draw.startHit.anchor,
      originX: draw.startHit.originX,
      originY: draw.startHit.originY,
      points: relPoints,
      createdAt: Date.now(),
    });

    if (draw.isPencilInstant) {
      showUndoToast(draw.songId, 'Traço salvo', 3500);
    }
  };

  const handleStartDragNote = useCallback(
    (note: TextNote, e: React.PointerEvent<HTMLButtonElement>) => {
      if (!currentSong || !annotateMode) return;
      if (drawingRef.current || erasingRef.current || dragNote) return;

      if (activeTool === 'eraser') {
        const preSnapshot = { strokes: songStrokes, notes: songNotes };
        erasingRef.current = {
          songId: currentSong.id,
          pointerId: e.pointerId,
          erasedIds: new Set<string>([note.id]),
          preSnapshot,
          didErase: true,
        };
        removeTextNote(currentSong.id, note.id, { skipHistory: true });
        announce('Nota apagada');
        trySetPointerCapture(stageInnerRef.current?.parentElement ?? null, e.pointerId);
        return;
      }

      const origRect = e.currentTarget.getBoundingClientRect();
      setDragNote({
        songId: currentSong.id,
        note,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        grabDx: e.clientX - origRect.left,
        grabDy: e.clientY - origRect.top,
        curX: e.clientX,
        curY: e.clientY,
        moved: false,
        origRect,
      });
      trySetPointerCapture(stageInnerRef.current?.parentElement ?? null, e.pointerId);
    },
    [currentSong, annotateMode, activeTool, dragNote, songStrokes, songNotes, removeTextNote, announce]
  );

  const handleTapNote = useCallback(
    (note: TextNote) => {
      if (!currentSong || !annotateMode) return;
      if (activeTool === 'eraser') {
        removeTextNote(currentSong.id, note.id);
        announce('Nota apagada');
        return;
      }
      setNoteDraft(note.text);
      setNoteToneDraft(note.tone);
      setNoteComposer({
        mode: 'edit',
        noteId: note.id,
        anchor: note.anchor,
        x: note.x,
        y: note.y,
        align: note.align ?? 'left',
        initialText: note.text,
        initialTone: note.tone,
      });
    },
    [currentSong, annotateMode, activeTool, removeTextNote, announce]
  );

  // Touch swipe & tap-zones on stage
  const handleTouchStart = (e: React.TouchEvent) => {
    if (annotateMode || deckOpen || noteComposer || drawingRef.current) return;
    if (Date.now() - lastPenActivityAtRef.current < PEN_SUPPRESS_MS) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (isStylusTouch(t)) {
      lastPenActivityAtRef.current = Date.now();
      return;
    }
    if (t.clientX < EDGE_GUARD_PX || t.clientX > window.innerWidth - EDGE_GUARD_PX) return;
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), horizontal: false, moved: false };
    if (swipeLayerRef.current) swipeLayerRef.current.style.transition = 'none';
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (annotateMode || drawingRef.current) return;
    const start = touchRef.current;
    if (!start || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (isStylusTouch(t)) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (!start.moved && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) start.moved = true;
    if (!start.horizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      start.horizontal = true;
    }
    if (!start.horizontal || !swipeLayerRef.current || prefersReduced()) return;
    const resist = (dx < 0 && atDeckEnd) || (dx > 0 && atDeckStart) ? 0.16 : 0.38;
    const offset = Math.max(-72, Math.min(72, dx * resist));
    swipeLayerRef.current.style.transform = `translate3d(${offset}px, 0, 0)`;
  };

  const resetSwipeLayer = (immediate = false) => {
    const el = swipeLayerRef.current;
    if (!el) return;
    el.style.transition =
      immediate || prefersReduced() ? 'none' : 'transform 220ms cubic-bezier(0.2, 0, 0, 1)';
    el.style.transform = '';
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (annotateMode || drawingRef.current) {
      touchRef.current = null;
      resetSwipeLayer(false);
      return;
    }
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || e.changedTouches.length !== 1) {
      resetSwipeLayer(false);
      return;
    }
    if (Date.now() - lastPenActivityAtRef.current < PEN_SUPPRESS_MS) {
      resetSwipeLayer(false);
      return;
    }
    const t = e.changedTouches[0];
    if (isStylusTouch(t)) {
      resetSwipeLayer(false);
      return;
    }
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    if (dt <= SWIPE_MAX_DT && Math.abs(dx) >= SWIPE_MIN_DX && Math.abs(dx) > Math.abs(dy) * SWIPE_DX_DY_RATIO) {
      const canCommit = (dx < 0 && !atDeckEnd) || (dx > 0 && !atDeckStart);
      resetSwipeLayer(canCommit);
      lastSwipeAtRef.current = Date.now();
      if (dx < 0) goNext();
      else goPrev();
    } else {
      resetSwipeLayer(false);
      if (start.moved) {
        lastSwipeAtRef.current = Date.now();
      }
    }
  };

  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (annotateMode || noteComposer || drawingRef.current) return;
    if (Date.now() - lastPenActivityAtRef.current < PEN_SUPPRESS_MS) return;
    if (Date.now() - lastSwipeAtRef.current < 360) return;
    if (e.clientX < EDGE_GUARD_PX || e.clientX > window.innerWidth - EDGE_GUARD_PX) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('button, a, [role="dialog"]')) return;
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
    const splitPoint = effectiveCols === 2 ? 0.5 : 0.32;
    if (relX <= splitPoint) goPrev();
    else goNext();
  };

  // Bluetooth pedal & keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'z' && !noteComposer) {
        if (currentSong && (annotateMode || canUndo || canRedo)) {
          e.preventDefault();
          const ok = e.shiftKey ? redoAnnotation(currentSong.id) : undoAnnotation(currentSong.id);
          if (ok) {
            setUndoSnackbar(null);
            announce(e.shiftKey ? 'Anotação refeita' : 'Anotação desfeita');
          }
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const modalOpen = Boolean(
        deckOpen ||
          settingsOpen ||
          noteComposer ||
          confirmClearOpen ||
          document.querySelector('[role="dialog"]')
      );
      if (e.key === 'Escape') {
        if (modalOpen) return;
        e.preventDefault();
        if (annotateMode) {
          cancelActiveGestures();
          setAnnotateMode(false);
          if (currentSong) void flushPendingSync(currentSong.id);
          announce('Modo de anotação encerrado');
          requestAnimationFrame(() => annotateToggleRef.current?.focus());
          return;
        }
        handleExit();
        return;
      }
      if (modalOpen) return;

      const targetEl = e.target instanceof Element ? e.target : null;
      if (
        targetEl &&
        (targetEl.tagName === 'INPUT' ||
          targetEl.tagName === 'TEXTAREA' ||
          (targetEl instanceof HTMLElement && targetEl.isContentEditable))
      ) {
        return;
      }
      const onControl = Boolean(targetEl?.closest('button, a, select, [role="button"]'));
      const allowSpace = singleKeyShortcuts && !onControl;

      const isForward =
        e.key === 'PageDown' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === 'MediaTrackNext' ||
        (!e.shiftKey && allowSpace && e.key === ' ') ||
        (!e.shiftKey && !onControl && e.key === 'Enter');
      const isBackward =
        e.key === 'PageUp' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowUp' ||
        e.key === 'Backspace' ||
        e.key === 'MediaTrackPrevious' ||
        (e.shiftKey && allowSpace && e.key === ' ');

      if (!isForward && !isBackward) return;
      e.preventDefault();
      if (e.repeat) return;
      const now = performance.now();
      if (now - lastKeyAtRef.current < KEY_DEBOUNCE_MS) return;
      lastKeyAtRef.current = now;
      if (isForward) goNext();
      else goPrev();
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    deckOpen,
    settingsOpen,
    noteComposer,
    confirmClearOpen,
    annotateMode,
    canUndo,
    canRedo,
    singleKeyShortcuts,
    currentSong,
    goNext,
    goPrev,
    handleExit,
    cancelActiveGestures,
    flushPendingSync,
    undoAnnotation,
    redoAnnotation,
    announce,
  ]);

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
      if (snackbarTimerRef.current) window.clearTimeout(snackbarTimerRef.current);
    };
  }, []);

  if (!currentSong) {
    return (
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center"
      >
        <h1 className="typescale-headline-sm text-on-surface m-0">
          {!songsLoaded ? 'Carregando slides...' : 'Nenhuma música para apresentar'}
        </h1>
        <AuroraButton color="filled" icon="arrow_back" onClick={handleExit}>
          Voltar
        </AuroraButton>
      </main>
    );
  }

  const { title: displayTitle } = getDisplayTitleAndArtist(currentSong);
  const minorKey = isMinorKey(displayedKey);
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const slideTransposeDelta =
    activeTranspose > 0 ? `+${activeTranspose}` : activeTranspose < 0 ? `${activeTranspose}` : '';
  const hasCustomSlideSettings =
    fitMode === 'manual' || activeTranspose !== 0 || colsPref !== 'auto';

  const handleAdjustFont = (delta: number, e: React.MouseEvent<HTMLButtonElement>) => {
    blurOnPointer(e);
    const base = fitMode === 'auto' ? Math.round(activeFontSize / 10) * 10 : manualFontSize;
    const next = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, base + delta));
    pendingPageRef.current = { kind: 'anchor', ...currentAnchorRef.current };
    setFitMode('manual');
    setMeasureProbe(null);
    setManualFontSize(next);
    announce(`Fonte manual ${next}%`);
  };

  const handleResetAutoFit = (e: React.MouseEvent<HTMLButtonElement>) => {
    blurOnPointer(e);
    pendingPageRef.current = { kind: 'anchor', ...currentAnchorRef.current };
    setFitMode('auto');
    setMeasureProbe(null);
    announce('Ajuste automático de tela ativado');
  };

  const handleAdjustTranspose = (delta: number, e: React.MouseEvent<HTMLButtonElement>) => {
    blurOnPointer(e);
    pendingPageRef.current = { kind: 'anchor', ...currentAnchorRef.current };
    setSlideTransposeBySong((prev) => {
      const cur = prev[currentSong.id]?.shift ?? 0;
      const mod = (((cur + delta) % 12) + 12) % 12;
      const nextShift = mod > 6 ? mod - 12 : mod;
      return {
        ...prev,
        [currentSong.id]: { shift: nextShift, useFlats: prev[currentSong.id]?.useFlats },
      };
    });
  };

  const handleResetTranspose = (e: React.MouseEvent<HTMLButtonElement>) => {
    blurOnPointer(e);
    pendingPageRef.current = { kind: 'anchor', ...currentAnchorRef.current };
    setSlideTransposeBySong((prev) => {
      const next = { ...prev };
      delete next[currentSong.id];
      return next;
    });
  };

  const handleToggleFlats = (e: React.MouseEvent<HTMLButtonElement>) => {
    blurOnPointer(e);
    pendingPageRef.current = { kind: 'anchor', ...currentAnchorRef.current };
    const nextFlats = !activeUseFlats;
    setSlideTransposeBySong((prev) => ({
      ...prev,
      [currentSong.id]: { shift: prev[currentSong.id]?.shift ?? 0, useFlats: nextFlats },
    }));
  };

  const handleToggleCapo = (e: React.MouseEvent<HTMLButtonElement>) => {
    blurOnPointer(e);
    pendingPageRef.current = { kind: 'anchor', ...currentAnchorRef.current };
    setCapoDisplay(capoDisplay === 'shapes' ? 'sounding' : 'shapes');
  };

  const handleToggleCols = (e: React.MouseEvent<HTMLButtonElement>) => {
    blurOnPointer(e);
    const nextCols: 1 | 2 = effectiveCols === 2 ? 1 : 2;
    pendingPageRef.current = { kind: 'anchor', ...currentAnchorRef.current };
    setColsPref(nextCols);
  };

  const handleToggleAnnotate = (e: React.MouseEvent<HTMLButtonElement>) => {
    blurOnPointer(e);
    cancelActiveGestures();
    setSettingsOpen(false);
    setAnnotateMode((prev) => {
      const next = !prev;
      if (!next) void flushPendingSync(currentSong.id);
      announce(next ? 'Modo de anotação ativado' : 'Modo de anotação encerrado');
      return next;
    });
  };

  const commitNote = (textValue: string) => {
    if (!noteComposer || !textValue.trim()) return;
    if (noteComposer.mode === 'edit' && noteComposer.noteId) {
      updateTextNote(currentSong.id, noteComposer.noteId, {
        text: textValue.trim(),
        tone: noteToneDraft,
      });
    } else {
      addTextNote(currentSong.id, {
        id: makeId('note'),
        text: textValue.trim(),
        tone: noteToneDraft,
        anchor: noteComposer.anchor,
        x: noteComposer.x,
        y: noteComposer.y,
        align: noteComposer.align,
        createdAt: Date.now(),
      });
    }
    setActiveTone(noteToneDraft);
    setNoteComposer(null);
    setNoteDraft('');
  };

  const singleSpread = activeSlide && activeSlide.columns.length <= 1;
  const usableStageH = Math.max(140, stageBox.height - HEIGHT_SAFETY_PX);
  const dragToneMeta = dragNote ? NOTE_TONE_MAP[dragNote.note.tone] ?? NOTE_TONE_MAP.amber : null;

  return (
    <div
      data-motion-scheme="standard"
      data-slides-mode="true"
      data-fit-mode={fitMode}
      data-effective-font={activeFontSize}
      className="fixed inset-0 bg-canvas text-on-surface flex flex-col select-none overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div role="status" aria-live="polite" className="sr-only">
        {liveStatus || `${displayTitle}, página ${safePageIdx + 1} de ${totalPages}`}
      </div>

      {/* Slim Single-Row Stage Top Bar (md+ single row, < md 2 balanced rows) */}
      <header className="flex-shrink-0 bg-surface-container-low border-b border-outline-variant/50 px-2.5 sm:px-4 py-1.5">
        <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-1.5 sm:gap-2">
          {/* Left: Exit + Setlist counter + Title + Key (< lg) / direct - Tom + (lg+) */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={(e) => {
                blurOnPointer(e);
                handleExit();
              }}
              aria-label="Sair dos slides"
              title="Sair (Esc)"
              className="stage-btn stage-btn-outlined h-10 min-h-[40px] px-2.5 xl:px-3 typescale-label-lg flex-shrink-0"
            >
              <UiIcon name="close" size={20} />
              <span className="hidden xl:inline">Sair</span>
            </button>

            {deckSongs.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  blurOnPointer(e);
                  setDeckOpen(true);
                }}
                aria-haspopup="dialog"
                aria-label={`Abrir setlist (${safeSongIdx + 1} de ${deckSongs.length})`}
                className="stage-btn stage-btn-tonal h-10 min-h-[40px] px-2.5 font-mono typescale-label-sm tabular-nums flex-shrink-0"
              >
                <UiIcon name="queue_music" size={20} />
                <span>
                  {safeSongIdx + 1}/{deckSongs.length}
                </span>
              </button>
            )}

            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              <h1 className="typescale-title-md text-on-surface m-0 truncate" title={displayTitle}>
                {displayTitle}
              </h1>

              {displayedKey && (
                <button
                  ref={keyPillTriggerRef}
                  type="button"
                  aria-expanded={settingsOpen}
                  aria-haspopup="dialog"
                  onClick={(e) => {
                    blurOnPointer(e);
                    settingsSourceRef.current = 'key';
                    setSettingsOpen((v) => !v);
                  }}
                  className={`lg:hidden inline-flex items-center justify-center min-h-[40px] min-w-[44px] stage-touch-44 px-2.5 rounded-full font-mono typescale-label-sm border-none flex-shrink-0 cursor-pointer ${
                    minorKey
                      ? 'bg-minor-bg text-minor-ink'
                      : 'bg-primary-container text-on-primary-container'
                  }`}
                  aria-label={`Tom ${displayedKey}. Abrir ajustes`}
                >
                  {displayedKey}
                </button>
              )}

              {/* Direct 1-tap Tonalidade stepper on iPad landscape & desktop (lg+) */}
              <div
                data-slides-transpose="true"
                role="group"
                aria-label="Ajustar tonalidade"
                className="hidden lg:inline-flex items-center rounded-full bg-surface-container p-0.5 flex-shrink-0"
              >
                <button
                  type="button"
                  onClick={(e) => handleAdjustTranspose(-1, e)}
                  aria-label="Baixar meio tom"
                  title="Baixar meio tom"
                  className="dock-stepper-btn"
                >
                  <UiIcon name="remove" size={20} />
                </button>
                <button
                  type="button"
                  disabled={activeTranspose === 0}
                  onClick={handleResetTranspose}
                  data-gm3-focal="true"
                  className={`min-w-[42px] h-9 px-2 rounded-full font-mono typescale-label-sm tabular-nums border-none ${
                    minorKey
                      ? 'bg-minor-bg text-minor-ink'
                      : 'bg-primary-container text-on-primary-container'
                  } ${activeTranspose !== 0 ? 'cursor-pointer' : 'cursor-default'}`}
                  title={
                    activeTranspose !== 0
                      ? `Tom ${displayedKey || slideTransposeDelta}. Toque para restaurar original`
                      : `Tom ${displayedKey || 'original'}`
                  }
                >
                  <span
                    key={shiftTracker.dir === 'none' ? 'init' : `${activeTranspose}-${activeUseFlats}`}
                    data-shift-dir={shiftTracker.dir === 'none' ? undefined : shiftTracker.dir}
                    className="chord-settle"
                  >
                    {displayedKey || slideTransposeDelta || 'Tom'}
                    {currentSong.capo > 0 && capoDisplay === 'shapes' ? `·C${currentSong.capo}` : ''}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleAdjustTranspose(1, e)}
                  aria-label="Subir meio tom"
                  title="Subir meio tom"
                  className="dock-stepper-btn"
                >
                  <UiIcon name="add" size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Right: Cifra|Letra|Acordes + direct Fonte (lg+) + Anotar + Ajustes */}
          <div className="flex items-center justify-between md:justify-end gap-1.5 w-full md:w-auto flex-shrink-0">
            <AuroraSegmented<DisplayMode>
              ariaLabel="Modo de leitura nos slides"
              blurOnPointer
              value={displayMode}
              onChange={(mode) => {
                pendingPageRef.current = { kind: 'anchor', ...currentAnchorRef.current };
                setDisplayMode(mode);
              }}
              options={[
                { value: 'both', label: 'Cifra' },
                { value: 'lyrics-only', label: 'Letra' },
                { value: 'chords-only', label: 'Acordes' },
              ]}
            />

            {/* Direct 1-tap Auto & Fonte stepper on lg+ */}
            <div
              data-slides-font="true"
              role="group"
              aria-label="Ajustar tamanho da fonte"
              className="hidden lg:inline-flex items-center gap-1 flex-shrink-0"
            >
              {fitMode === 'manual' && (
                <button
                  type="button"
                  onClick={handleResetAutoFit}
                  aria-label="Voltar para ajuste automático"
                  title="Voltar para ajuste automático"
                  className="stage-btn stage-btn-tonal h-10 min-h-[40px] px-3 typescale-label-sm"
                >
                  Auto
                </button>
              )}
              <div className="inline-flex items-center rounded-full bg-surface-container p-0.5">
                <button
                  type="button"
                  onClick={(e) => handleAdjustFont(-10, e)}
                  aria-label={`Diminuir fonte (atual ${activeFontSize}%)`}
                  title={`Diminuir fonte (${activeFontSize}%)`}
                  className="dock-stepper-btn font-mono typescale-label-sm"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={(e) => handleAdjustFont(10, e)}
                  aria-label={`Aumentar fonte (atual ${activeFontSize}%)`}
                  title={`Aumentar fonte (${activeFontSize}%)`}
                  className="dock-stepper-btn font-mono typescale-label-sm"
                >
                  A+
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                ref={annotateToggleRef}
                id="slides-annotate-btn"
                data-slides-annotate-trigger="true"
                type="button"
                aria-pressed={annotateMode}
                aria-controls={annotateMode ? 'slides-annotate-toolbar' : undefined}
                aria-label={
                  totalAnnotationCount > 0
                    ? `Anotar nos slides (${totalAnnotationCount})`
                    : 'Anotar nos slides'
                }
                onClick={handleToggleAnnotate}
                className={`relative stage-btn h-10 min-h-[40px] px-2.5 xl:px-3 typescale-label-lg ${
                  annotateMode ? 'stage-btn-primary-tonal' : 'stage-btn-outlined'
                }`}
              >
                <UiIcon name="draw" size={20} />
                <span className="hidden xl:inline">Anotar</span>
                {totalAnnotationCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-warn-bg text-warn-ink font-mono typescale-label-sm tabular-nums">
                    {totalAnnotationCount}
                  </span>
                )}
              </button>

              {/* Unified Slides Ajustes popover */}
              <div ref={settingsWrapRef} className="relative flex-shrink-0">
                <button
                  ref={settingsTriggerRef}
                  type="button"
                  data-slides-settings-trigger="true"
                  aria-haspopup="dialog"
                  aria-expanded={settingsOpen}
                  aria-label="Ajustes dos slides"
                  title="Ajustes (fonte, tonalidade, colunas, tema, Tela limpa)"
                  onClick={(e) => {
                    blurOnPointer(e);
                    settingsSourceRef.current = 'settings';
                    setSettingsOpen((v) => !v);
                  }}
                  className={`relative stage-btn h-10 min-h-[40px] px-2.5 xl:px-3 typescale-label-lg ${
                    settingsOpen ? 'stage-btn-tonal' : 'stage-btn-outlined'
                  }`}
                >
                  <UiIcon name="tune" size={20} />
                  <span className="hidden xl:inline">Ajustes</span>
                  {hasCustomSlideSettings && (
                    <span
                      aria-hidden="true"
                      className="absolute top-1.5 right-1.5 xl:static w-2 h-2 rounded-full bg-primary"
                    />
                  )}
                </button>

                {settingsOpen && (
                  <div
                    role="dialog"
                    aria-label="Ajustes dos slides"
                    data-slides-settings-popover="true"
                    className="stage-popover absolute right-0 top-[calc(100%+8px)] z-50 w-[min(320px,calc(100vw-24px))] max-h-[min(80vh,580px)] overflow-y-auto rounded-[24px] bg-surface border border-outline-variant p-4 space-y-3 text-left"
                    style={{ boxShadow: 'var(--ui-elevation-overlay)' }}
                  >
                    {/* 1. Fonte & Auto-Fit */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="typescale-label-sm text-on-surface-variant">Fonte</span>
                        {fitMode === 'manual' ? (
                          <button
                            type="button"
                            onClick={handleResetAutoFit}
                            className="stage-btn stage-btn-tonal stage-touch-44 h-8 min-h-[36px] px-3 typescale-label-sm"
                          >
                            Voltar para Auto
                          </button>
                        ) : (
                          <span className="typescale-body-sm text-on-surface-variant">
                            Autoajuste ativo
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between rounded-full bg-surface-container p-0.5">
                        <button
                          type="button"
                          onClick={(e) => handleAdjustFont(-10, e)}
                          aria-label="Diminuir fonte"
                          className="dock-stepper-btn flex-1 font-mono typescale-label-sm"
                        >
                          A-
                        </button>
                        <span className="font-mono typescale-label-sm tabular-nums text-on-surface px-3">
                          {activeFontSize}%
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleAdjustFont(10, e)}
                          aria-label="Aumentar fonte"
                          className="dock-stepper-btn flex-1 font-mono typescale-label-sm"
                        >
                          A+
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-outline-variant/50" />

                    {/* 2. Tonalidade & Capo */}
                    <div className="space-y-2">
                      <div className="typescale-label-sm text-on-surface-variant">Tonalidade</div>
                      <div className="flex items-center gap-1.5 w-full">
                        <div className="inline-flex items-center justify-between flex-1 rounded-full bg-surface-container p-0.5">
                          <button
                            type="button"
                            onClick={(e) => handleAdjustTranspose(-1, e)}
                            aria-label="Baixar meio tom"
                            className="dock-stepper-btn"
                          >
                            <UiIcon name="remove" size={20} />
                          </button>
                          <button
                            type="button"
                            disabled={activeTranspose === 0}
                            onClick={handleResetTranspose}
                            aria-label={
                              activeTranspose !== 0
                                ? `Tom ${displayedKey || slideTransposeDelta}. Restaurar tom original`
                                : `Tom ${displayedKey || 'original'}`
                            }
                            title={
                              activeTranspose !== 0
                                ? 'Toque para restaurar o tom original'
                                : 'Tom atual'
                            }
                            className={`min-w-[68px] h-9 px-2 rounded-full font-mono typescale-label-sm tabular-nums border-none ${
                              activeTranspose !== 0
                                ? 'bg-primary-container text-on-primary-container cursor-pointer'
                                : 'bg-transparent text-on-surface cursor-default'
                            }`}
                          >
                            {displayedKey || '0'}
                            {slideTransposeDelta ? ` (${slideTransposeDelta})` : ''}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleAdjustTranspose(1, e)}
                            aria-label="Subir meio tom"
                            className="dock-stepper-btn"
                          >
                            <UiIcon name="add" size={20} />
                          </button>
                        </div>
                        <button
                          type="button"
                          aria-pressed={activeUseFlats}
                          onClick={handleToggleFlats}
                          aria-label={activeUseFlats ? 'Mudar para sustenidos' : 'Mudar para bemóis'}
                          title="Alternar sustenidos (#) e bemóis (b)"
                          className={`stage-touch-44 inline-flex items-center justify-center w-9 h-9 rounded-full border-none font-mono typescale-label-lg cursor-pointer flex-shrink-0 transition-colors ${
                            activeUseFlats
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                          }`}
                        >
                          {activeUseFlats ? '♭' : '♯'}
                        </button>
                      </div>

                      {currentSong.capo > 0 && (
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="typescale-body-sm text-on-surface-variant">
                            Capo {currentSong.capo}
                          </span>
                          <button
                            type="button"
                            onClick={handleToggleCapo}
                            aria-pressed={capoDisplay === 'shapes'}
                            className={`stage-btn h-9 min-h-[36px] px-3 typescale-label-sm ${
                              capoDisplay === 'shapes' ? 'stage-btn-primary-tonal' : 'stage-btn-outlined'
                            }`}
                          >
                            {capoDisplay === 'shapes' ? 'Formas no capo' : 'Tom real'}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-outline-variant/50" />

                    {/* 3. Visual: Colunas & Tema */}
                    <div className="space-y-2">
                      <div className="typescale-label-sm text-on-surface-variant">Visual</div>
                      <div className="flex items-center gap-2">
                        {canUseTwoCols && (
                          <button
                            type="button"
                            aria-pressed={effectiveCols === 2}
                            onClick={handleToggleCols}
                            className={`stage-btn h-10 min-h-[40px] flex-1 px-2.5 typescale-label-sm ${
                              effectiveCols === 2 ? 'stage-btn-tonal' : 'stage-btn-outlined'
                            }`}
                          >
                            <UiIcon name="view_column_2" size={20} />
                            {effectiveCols === 2 ? '2 colunas' : '1 coluna'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            blurOnPointer(e);
                            const next = isDark ? 'light' : 'dark';
                            setTheme(next);
                            applyColorScheme(next);
                          }}
                          className="stage-btn stage-btn-outlined h-10 min-h-[40px] flex-1 px-2.5 typescale-label-sm"
                        >
                          <UiIcon name={isDark ? 'sunny' : 'nightlight'} size={20} />
                          {isDark ? 'Tema claro' : 'Tema escuro'}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-outline-variant/50 pt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          blurOnPointer(e);
                          setSettingsOpen(false);
                          switchToCleanStage();
                        }}
                        className="stage-btn stage-btn-outlined w-full justify-center h-10 min-h-[40px] typescale-label-sm"
                      >
                        <UiIcon name="fullscreen" size={20} />
                        Trocar para Tela limpa (rolagem)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Optional compact single-line stage cue strip */}
      {currentSong.notes.trim() && (
        <aside aria-label="Deixa de palco" className="flex-shrink-0 px-3 sm:px-4 pt-1.5">
          <div className="rounded-xl bg-warn-bg text-warn-ink px-3 py-1 typescale-body-sm truncate">
            <span className="typescale-label-sm mr-1.5">Deixa:</span>
            {currentSong.notes}
          </div>
        </aside>
      )}

      {/* Full-bleed Slide Stage (zero reflow on Annotate toggle!) */}
      <main
        id="main"
        tabIndex={-1}
        data-slides-stage="true"
        onClick={handleStageClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          touchRef.current = null;
          resetSwipeLayer();
        }}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={(e) => finishStagePointer(e, false)}
        onPointerCancel={(e) => finishStagePointer(e, true)}
        className={`relative flex-1 min-h-0 overflow-hidden px-3 sm:px-4 py-2 focus:outline-none ${
          annotateMode ? 'touch-none cursor-crosshair ring-2 ring-inset ring-primary/70' : 'cursor-pointer'
        }`}
      >
        {/* Subtle WAAPI edge turn feedback */}
        <div
          ref={edgePulseLeftRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-3 left-1 w-1.5 rounded-full bg-primary z-20"
          style={{ opacity: 0 }}
        />
        <div
          ref={edgePulseRightRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-3 right-1 w-1.5 rounded-full bg-primary z-20"
          style={{ opacity: 0 }}
        />

        {/* Song boundary cue pill */}
        {songBanner && (
          <div
            key={songBanner.seq}
            aria-hidden="true"
            className="stage-toast pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100%-32px)] rounded-full bg-inverse-surface text-inverse-on-surface px-4 py-1.5 typescale-label-sm truncate"
            style={{ boxShadow: 'var(--ui-elevation-overlay)' }}
          >
            {songBanner.text}
          </div>
        )}

        {/* Undo snackbar for Apple Pencil / Clear All */}
        {undoSnackbar && undoSnackbar.songId === currentSong.id && canUndo && (
          <div
            key={undoSnackbar.seq}
            role="status"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="dock-enter-bottom fixed bottom-[64px] left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 rounded-full bg-inverse-surface text-inverse-on-surface pl-4 pr-1.5 py-1 typescale-body-sm"
            style={{ boxShadow: 'var(--ui-elevation-overlay)' }}
          >
            <span>{undoSnackbar.message}</span>
            <button
              type="button"
              onClick={(e) => {
                blurOnPointer(e);
                undoAnnotation(currentSong.id);
                setUndoSnackbar(null);
              }}
              className="stage-btn stage-btn-primary-tonal h-9 min-h-[36px] px-3 typescale-label-sm"
            >
              Desfazer
            </button>
          </div>
        )}

        <div ref={stageInnerRef} className="relative w-full h-full overflow-visible">
          {/* Hidden exact-width measurement mirror driving deterministic multi-pass Auto-Fit */}
          {measureColWidth > 0 && (
            <div
              ref={measureRef}
              aria-hidden="true"
              inert
              className="pointer-events-none invisible absolute top-0 left-0 -z-10"
              style={{ width: `${measureColWidth}px`, fontSize: `${mirrorFontSize}%` }}
            >
              {preparedSections.map((sec) => {
                const isLyricsOnly = displayMode === 'lyrics-only';
                if (sec.instrumentalOnly) {
                  return (
                    <section
                      key={sec.sectionIdx}
                      data-measure-section={sec.sectionIdx}
                      className="stage-card px-4 py-2 flex items-center gap-2"
                    >
                      <span className="typescale-label-sm">{formatSectionLabel(sec.label)}</span>
                      <span className="typescale-body-sm">· trecho instrumental</span>
                    </section>
                  );
                }
                return (
                  <section
                    key={sec.sectionIdx}
                    data-measure-section={sec.sectionIdx}
                    className={`stage-card ${
                      isLyricsOnly ? 'px-4 sm:px-5 xl:px-6 py-3 xl:py-3.5' : 'px-4 sm:px-5 xl:px-6 py-2.5 xl:py-3.5'
                    }`}
                  >
                    <div className="mb-1.5">
                      <span className="inline-flex rounded-full px-2.5 py-0.5 typescale-label-sm">
                        {formatSectionLabel(sec.label)}
                      </span>
                    </div>
                    <div
                      data-measure-lines="true"
                      className={isLyricsOnly ? 'space-y-1.5' : 'space-y-0.5'}
                    >
                      {sec.lines.map((line, li) => (
                        <div key={li} data-measure-line={li}>
                          <SlideChordLine
                            line={line}
                            displayMode={displayMode}
                            shiftDir="none"
                            shiftKey="m"
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {/* Visible full-bleed paginated slide */}
          <div ref={swipeLayerRef} className="relative w-full h-full flex items-stretch">
            {isLayoutSynced && (
              <div
                key={`${currentSong.id}-${safePageIdx}-${turnAnim.seq}`}
                data-turn={turnAnim.dir}
                className={`slide-turn-stage relative isolate w-full h-full ${
                  effectiveCols === 2 && !singleSpread
                    ? 'grid grid-cols-2 gap-3 xl:gap-4 items-stretch'
                    : 'flex items-stretch'
                }`}
                style={{ fontSize: `${activeFontSize}%` }}
              >
                <StrokeLayer strokes={pageStrokes} coordMode="page" renderKind="highlighter" />

                {activeSlide && activeSlide.columns.some((c) => c.length > 0) ? (
                  activeSlide.columns.map((colChunks, colIdx) => {
                    const colNaturalH = activeSlide.columnHeights[colIdx] ?? 0;
                    const colNaturalFill = colNaturalH / usableStageH;
                    const allowColumnAlign =
                      effectiveCols === 2 &&
                      activeSlide.columns.length === 2 &&
                      colNaturalFill >= 0.65;
                    return (
                      <div
                        key={colIdx}
                        data-slide-column={colIdx}
                        className={`relative z-[1] h-full overflow-hidden flex flex-col min-w-0 w-full ${
                          annotateMode ? 'touch-none' : ''
                        }`}
                        style={{ gap: `${cardGapPx}px` }}
                      >
                        {colChunks.map((chunk) => (
                          <SlideSectionCard
                            key={`${chunk.sectionIdx}-${chunk.startLineIdx}`}
                            chunk={chunk}
                            displayMode={displayMode}
                            allowColumnAlign={allowColumnAlign}
                            shiftDir={shiftTracker.dir}
                            shiftKey={`${activeTranspose}-${activeUseFlats}`}
                            strokesByAnchor={strokesByAnchor}
                            notesByAnchor={notesByAnchor}
                            annotateMode={annotateMode}
                            activeTool={activeTool}
                            draggingNoteId={dragNote?.moved ? dragNote.note.id : null}
                            onStartDragNote={handleStartDragNote}
                            onTapNote={(n) => handleTapNote(n)}
                          />
                        ))}
                      </div>
                    );
                  })
                ) : (
                  <div className="w-full h-full flex items-center justify-center typescale-body-md text-on-surface-variant">
                    {displayMode === 'chords-only'
                      ? 'Esta música não tem acordes marcados.'
                      : 'Nenhum conteúdo para exibir neste modo.'}
                  </div>
                )}

                <StrokeLayer strokes={pageStrokes} coordMode="page" renderKind="pen" />
                <TextNoteList
                  notes={pageNotes}
                  coordMode="page"
                  annotateMode={annotateMode}
                  activeTool={activeTool}
                  draggingNoteId={dragNote?.moved ? dragNote.note.id : null}
                  onStartDragNote={handleStartDragNote}
                  onTapNote={(n) => handleTapNote(n)}
                />
              </div>
            )}

            {/* Zero-latency live drawing stroke preview */}
            {liveStroke && liveStroke.points.length > 0 && (
              <svg className="pointer-events-none absolute inset-0 w-full h-full z-30 overflow-visible">
                <path
                  d={buildSmoothSvgPath(liveStroke.points.map((p) => [p.x, p.y, p.pressure]))}
                  fill="none"
                  stroke={
                    liveStroke.tool === 'highlighter'
                      ? NOTE_TONE_MAP[liveStroke.tone].hiVar
                      : NOTE_TONE_MAP[liveStroke.tone].inkVar
                  }
                  strokeWidth={
                    computeStrokeWidthEm(
                      liveStroke.tool,
                      liveStroke.points.map((p) => [p.x, p.y, p.pressure])
                    ) * Math.max(10, (16 * activeFontSize) / 100)
                  }
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Floating dragged note chip (GPU-composited translate3d, zero layout thrashing) */}
        {dragNote && dragNote.moved && dragToneMeta && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed left-0 top-0 z-50 inline-flex items-start gap-1.5 px-2.5 py-1 rounded-xl w-max max-w-[220px]"
            style={{
              transform: `translate3d(${dragNote.curX - dragNote.grabDx}px, ${dragNote.curY - dragNote.grabDy}px, 0)${prefersReduced() ? '' : ' scale(1.03)'}`,
              backgroundColor: dragToneMeta.chipBg,
              color: dragToneMeta.chipFg,
              boxShadow: 'var(--ui-elevation-overlay)',
            }}
          >
            <span className="mt-[4px]">
              <ToneShapeGlyph shape={dragToneMeta.shape} color={dragToneMeta.dotColor} size={8} />
            </span>
            <span className="typescale-label-sm break-words whitespace-pre-wrap">
              {dragNote.note.text}
            </span>
          </div>
        )}
      </main>

      {/* Constant 56px bottom navigation footer (opacity cross-fade while annotating -> 0px reflow!) */}
      <footer
        aria-hidden={annotateMode || undefined}
        className={`slides-footer relative flex-shrink-0 h-[56px] bg-surface-container-low border-t border-outline-variant/50 px-3 sm:px-5 flex items-center justify-between gap-2 ${
          annotateMode ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <span
          aria-hidden="true"
          className="slide-progress-fill absolute top-0 inset-x-0 h-[2px] bg-primary/70 origin-left pointer-events-none"
          style={{
            transform: `scaleX(${Math.max(0.04, (safePageIdx + 1) / Math.max(1, totalPages))})`,
          }}
        />

        <button
          type="button"
          tabIndex={annotateMode ? -1 : 0}
          disabled={atDeckStart}
          onClick={(e) => {
            blurOnPointer(e);
            goPrev();
          }}
          className="stage-btn stage-btn-tonal h-10 min-h-[40px] px-3 sm:px-4 typescale-label-lg"
        >
          <UiIcon name="chevron_left" size={20} />
          <span className="hidden sm:inline">
            {safePageIdx === 0 && prevSong ? 'Música anterior' : 'Anterior'}
          </span>
          <span className="sm:hidden">Ant.</span>
        </button>

        <div className="flex items-center justify-center gap-2.5 min-w-0 flex-1">
          {totalPages <= 8 && !(isLastPageOfSong && nextSong) && (
            <div className="hidden sm:flex items-center gap-2.5" aria-hidden="true">
              {Array.from({ length: totalPages }, (_, i) => (
                <span
                  key={i}
                  data-active={i === safePageIdx ? 'true' : undefined}
                  className={`slide-page-dot ${i === safePageIdx ? 'bg-primary' : 'bg-outline'}`}
                />
              ))}
            </div>
          )}

          <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high font-mono typescale-label-sm tabular-nums text-on-surface whitespace-nowrap">
            Pág {safePageIdx + 1}/{totalPages}
          </span>

          {isLastPageOfSong && nextSong && (
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 typescale-body-sm text-on-surface-variant truncate max-w-[260px]">
              <span className="truncate">Próx: {getDisplayTitleAndArtist(nextSong).title}</span>
              {getEffectiveKey(nextSong).key && (
                <span className="font-mono text-on-surface flex-shrink-0">
                  · {getEffectiveKey(nextSong).key}
                </span>
              )}
            </span>
          )}
        </div>

        <button
          type="button"
          tabIndex={annotateMode ? -1 : 0}
          disabled={atDeckEnd}
          onClick={(e) => {
            blurOnPointer(e);
            goNext();
          }}
          className="stage-btn stage-btn-filled h-10 min-h-[40px] px-3 sm:px-4 typescale-label-lg"
        >
          <span className="hidden sm:inline">
            {isLastPageOfSong && nextSong ? 'Próxima música' : 'Próxima'}
          </span>
          <span className="sm:hidden">Próx.</span>
          <UiIcon name="chevron_right" size={20} />
        </button>
      </footer>

      {/* Floating Annotation Dock overlay (0px stage height impact!) */}
      {annotateMode && (
        <nav
          aria-label="Barra de ferramentas de anotação"
          className="fixed bottom-1.5 inset-x-0 z-40 px-2 sm:px-4 pointer-events-none flex justify-center"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div
            ref={annotateToolbarRef}
            id="slides-annotate-toolbar"
            role="toolbar"
            aria-label="Ferramentas de anotação"
            className="dock-enter-bottom stage-floating-bar pointer-events-auto flex flex-wrap sm:flex-nowrap items-center justify-center gap-1.5 rounded-[24px] px-2.5 py-1.5 max-w-full"
          >
            <AuroraSegmented<AnnotateTool>
              ariaLabel="Ferramenta de anotação"
              blurOnPointer
              className="slides-tool-segmented"
              value={activeTool}
              onChange={setActiveTool}
              options={[
                { value: 'pen', label: 'Caneta', shortLabel: 'Caneta', icon: 'edit' },
                { value: 'highlighter', label: 'Marca-texto', shortLabel: 'Marca', icon: 'ink_highlighter' },
                { value: 'text', label: 'Nota', shortLabel: 'Nota', icon: 'sticky_note_2' },
                { value: 'eraser', label: 'Apagar', shortLabel: 'Apagar', icon: 'ink_eraser' },
              ]}
            />

            <div
              role="group"
              aria-label="Cor da anotação"
              aria-hidden={activeTool === 'eraser' || undefined}
              className={`slides-footer flex items-center gap-0.5 ${
                activeTool === 'eraser' ? 'opacity-30 pointer-events-none' : 'opacity-100'
              }`}
            >
              {NOTE_TONES.map((tone) => {
                const label = TONE_LABELS_PT[tone.id];
                return (
                  <button
                    key={tone.id}
                    type="button"
                    tabIndex={activeTool === 'eraser' ? -1 : 0}
                    disabled={activeTool === 'eraser'}
                    aria-label={`Cor ${label}`}
                    title={label}
                    aria-pressed={activeTone === tone.id}
                    onClick={(e) => {
                      blurOnPointer(e);
                      setActiveTone(tone.id);
                    }}
                    className="swatch-btn"
                  >
                    <ToneShapeGlyph shape={tone.shape} color={tone.dotColor} size={14} />
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-0.5">
              <AuroraIconButton
                icon="undo"
                label="Desfazer anotação"
                disabled={!canUndo}
                onClick={(e) => {
                  blurOnPointer(e);
                  undoAnnotation(currentSong.id);
                }}
              />
              <AuroraIconButton
                icon="redo"
                label="Refazer anotação"
                disabled={!canRedo}
                onClick={(e) => {
                  blurOnPointer(e);
                  redoAnnotation(currentSong.id);
                }}
              />
              {totalAnnotationCount > 0 && (
                <AuroraIconButton
                  icon="delete_sweep"
                  label="Limpar anotações desta música"
                  onClick={(e) => {
                    blurOnPointer(e);
                    setConfirmClearOpen(true);
                  }}
                />
              )}
              <button
                type="button"
                onClick={(e) => {
                  const viaKeyboard = e.detail === 0;
                  blurOnPointer(e);
                  cancelActiveGestures();
                  setAnnotateMode(false);
                  void flushPendingSync(currentSong.id);
                  if (viaKeyboard) {
                    requestAnimationFrame(() => annotateToggleRef.current?.focus());
                  }
                }}
                className="stage-btn stage-btn-filled h-10 min-h-[40px] px-3.5 typescale-label-lg"
              >
                <UiIcon name="check" size={20} />
                Concluir
              </button>
            </div>
          </div>
        </nav>
      )}

      {/* Confirm clear all annotations */}
      <AuroraDialog
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        motionScheme="standard"
        title="Limpar anotações desta música?"
        subtitle="Remove todos os traços e notas de palco salvos nos slides desta música."
        maxWidth="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <AuroraButton color="outlined" onClick={() => setConfirmClearOpen(false)}>
            Cancelar
          </AuroraButton>
          <AuroraButton
            color="danger"
            onClick={() => {
              clearSongAnnotations(currentSong.id);
              setConfirmClearOpen(false);
              showUndoToast(currentSong.id, 'Anotações limpas', 5000);
            }}
          >
            Limpar tudo
          </AuroraButton>
        </div>
      </AuroraDialog>

      {/* Text note composer modal (create & edit + tone picker + quick cues) */}
      <AuroraDialog
        open={Boolean(noteComposer)}
        onClose={() => setNoteComposer(null)}
        motionScheme="standard"
        title={noteComposer?.mode === 'edit' ? 'Editar nota de palco' : 'Adicionar nota de palco'}
        subtitle="Escolha uma deixa rápida ou escreva seu lembrete"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_NOTE_CUES.map((cue) => (
              <AuroraChip key={cue} onClick={() => commitNote(cue)}>
                {cue}
              </AuroraChip>
            ))}
          </div>

          <div className="flex items-center gap-1.5" role="group" aria-label="Cor da nota">
            {NOTE_TONES.map((tone) => (
              <button
                key={tone.id}
                type="button"
                aria-label={`Cor ${TONE_LABELS_PT[tone.id]}`}
                aria-pressed={noteToneDraft === tone.id}
                onClick={() => setNoteToneDraft(tone.id)}
                className="swatch-btn"
              >
                <ToneShapeGlyph shape={tone.shape} color={tone.dotColor} size={14} />
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitNote(noteDraft);
            }}
            className="flex flex-wrap gap-2"
          >
            <label htmlFor="slide-note-text" className="sr-only">
              Texto da anotação
            </label>
            <input
              id="slide-note-text"
              type="text"
              autoFocus
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Ex.: Crescer no 2o refrão"
              className="stage-field text-base lg:text-sm flex-1 min-w-[180px]"
            />
            {noteComposer?.mode === 'edit' && noteComposer.noteId && (
              <AuroraButton
                color="danger"
                onClick={() => {
                  removeTextNote(currentSong.id, noteComposer.noteId!);
                  setNoteComposer(null);
                }}
              >
                Excluir
              </AuroraButton>
            )}
            <AuroraButton type="submit" color="filled" disabled={!noteDraft.trim()}>
              Salvar
            </AuroraButton>
          </form>
        </div>
      </AuroraDialog>

      {/* Setlist deck drawer */}
      <AuroraSheet
        open={deckOpen}
        onClose={() => setDeckOpen(false)}
        motionScheme="standard"
        title={activeSetlist?.name ?? 'Sequência'}
        subtitle={`${deckSongs.length} ${deckSongs.length === 1 ? 'música' : 'músicas'} neste conjunto`}
      >
        <ol className="m-0 p-0 list-none space-y-1.5">
          {deckSongs.map((s, idx) => {
            const active = idx === safeSongIdx;
            const info = getDisplayTitleAndArtist(s);
            const key = getEffectiveKey(s).key;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => {
                    pendingPageRef.current = { kind: 'first', announceSong: info.title };
                    currentAnchorRef.current = { sectionIdx: 0, lineIdx: 0 };
                    setFitMode('auto');
                    setMeasureProbe(null);
                    setActiveSongId(s.id);
                    setTurnAnim((prev) => ({
                      dir: idx > safeSongIdx ? 'next' : 'prev',
                      seq: prev.seq + 1,
                    }));
                    setDeckOpen(false);
                  }}
                  className={`stage-list-row w-full min-h-[48px] px-4 py-2.5 rounded-2xl border-none flex items-center justify-between gap-3 text-left cursor-pointer ${
                    active
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  <span className="typescale-title-md truncate">
                    {idx + 1}. {info.title}
                  </span>
                  <span className="typescale-label-sm font-mono flex-shrink-0">{key || '-'}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </AuroraSheet>
    </div>
  );
}
