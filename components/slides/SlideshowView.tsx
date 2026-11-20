'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import type { ParsedSong, Setlist } from '@/lib/types/song';
import {
  NOTE_TONE_MAP,
  simplifyRawPoints,
  type AnnotateTool,
  type AnnotationAnchor,
  type InkStroke,
  type NoteTone,
  type StrokeTool,
  type TextNote,
} from '@/lib/types/annotations';
import { useDisplayStore, type DisplayMode } from '@/lib/stores/display-store';
import { useAnnotationStore } from '@/lib/stores/annotation-store';
import { useWakeLock } from '@/lib/hooks/use-wake-lock';
import {
  SECTION_COLORS,
  isMinorKey,
  shouldPreferFlats,
  transposeChord,
  transposeLine,
} from '@/lib/utils/music';
import {
  computeSlideFillStats,
  findSlideIndexForAnchor,
  packSectionsIntoSlides,
  prepareSlideSections,
  type SlideChunk,
  type SlidePage,
  type SlideSectionMetrics,
} from '@/lib/utils/slide-pagination';
import { prefersReducedMotion } from '@/lib/utils/view-transition';
import { ChordLine } from '@/components/chord-sheet/ChordLine';
import { ConnectedGroup } from '@/components/ui/ConnectedGroup';
import { SetlistDrawer } from '@/components/show-mode/SetlistDrawer';
import {
  LiveStrokePreview,
  SlideAnnotationDock,
  SlideNoteComposer,
  StrokeLayer,
  TextNoteList,
  ToneShapeGlyph,
  type SectionMoveOption,
} from './SlideAnnotations';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ColumnsIcon,
  EditIcon,
  MenuListIcon,
  MoonIcon,
  SunIcon,
} from '@/components/ui/Icons';

const SWIPE_MIN_DX = 48;
const SWIPE_MAX_DT = 650;
const SWIPE_DX_DY_RATIO = 1.35;
const DRAG_CANCEL_PX = 10;
const EDGE_GUARD_PX = 16;
const KEY_DEBOUNCE_MS = 140;
const PEN_SUPPRESS_MS = 480;
const COL_GAP_PX = 12;
const CARD_GAP_PX = 10;
const HEIGHT_SAFETY_PX = 4;
const MIN_FONT_SIZE = 70;
const MAX_FONT_SIZE = 180;
const AUTO_FIT_MAX_FONT = 166;
const AUTO_FIT_MIN_FONT = 84;

const EMPTY_STROKES: InkStroke[] = [];
const EMPTY_NOTES: TextNote[] = [];

const subscribeSystemDark = (cb: () => void) => {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
};
const getSystemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const getServerDark = () => false;

const noopChordTap = () => {};

function blurOnPointer(e: React.MouseEvent<HTMLButtonElement>) {
  // Prevent iPad touch/mouse taps from leaving focus on a toolbar button where
  // a Bluetooth pedal sending Space/Enter would accidentally re-trigger it.
  if (e.detail > 0) {
    e.currentTarget.blur();
  }
}

function trySetPointerCapture(el: Element | null, pointerId: number) {
  if (!el) return;
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // Ignore inactive/synthetic/palm-cancelled pointer capture errors on iPadOS Safari
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

interface SlideSectionCardProps {
  chunk: SlideChunk;
  displayMode: DisplayMode;
  allowColumnAlign: boolean;
  strokesByAnchor: Map<string, InkStroke[]>;
  notesByAnchor: Map<string, TextNote[]>;
  annotateMode: boolean;
  activeTool: AnnotateTool;
  draggingNoteId: string | null;
  onStartDragNote: (note: TextNote, e: React.PointerEvent<HTMLButtonElement>) => void;
  onTapNote: (note: TextNote, rect: DOMRect) => void;
}

function SlideSectionCard({
  chunk,
  displayMode,
  allowColumnAlign,
  strokesByAnchor,
  notesByAnchor,
  annotateMode,
  activeTool,
  draggingNoteId,
  onStartDragNote,
  onTapNote,
}: SlideSectionCardProps) {
  const colors = SECTION_COLORS[chunk.type] || SECTION_COLORS.verse;
  const isLyricsOnly = displayMode === 'lyrics-only';
  const isChorus = chunk.type === 'chorus';

  const headerKey = anchorKey(chunk.sectionIdx, -1);
  const headerStrokes = strokesByAnchor.get(headerKey) ?? EMPTY_STROKES;
  const headerNotes = notesByAnchor.get(headerKey) ?? EMPTY_NOTES;

  if (chunk.instrumentalOnly) {
    return (
      <section
        data-slide-chunk="true"
        data-section-idx={chunk.sectionIdx}
        className="relative rounded-[22px] px-4 py-2 flex items-center gap-2 flex-shrink-0"
        style={{ background: colors.bg }}
      >
        <div
          data-slide-line-anchor="true"
          data-section-idx={chunk.sectionIdx}
          data-orig-line={-1}
          className="relative isolate flex items-center gap-2 w-full"
        >
          <StrokeLayer strokes={headerStrokes} coordMode="em" renderKind="highlighter" />
          <div className="relative z-[1] inline-flex items-center gap-2">
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 whitespace-nowrap"
              style={{ backgroundColor: colors.pillBg }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: colors.bd }}
                aria-hidden="true"
              />
              <h2
                className="font-display text-[clamp(13px,0.78em,18px)] font-semibold leading-tight"
                style={{ color: colors.lb }}
              >
                {chunk.label}
              </h2>
            </div>
            <span className="text-xs text-[var(--muted)]">· trecho instrumental</span>
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

  // Gentle baseline alignment ONLY on well-filled 2-column spreads; sparse columns & 1-col portrait hug
  // their larger auto-fitted typography cleanly without creating large blank card voids.
  const flexGrow = allowColumnAlign
    ? chunk.type === 'intro' && chunk.lines.length <= 2
      ? 0.25
      : Math.max(1, chunk.lines.length)
    : 0;

  return (
    <section
      data-slide-chunk="true"
      data-section-idx={chunk.sectionIdx}
      className={`relative rounded-[22px] flex flex-col justify-start min-h-0 ${
        allowColumnAlign ? '' : 'flex-shrink-0'
      } ${isLyricsOnly ? 'px-4 sm:px-5 xl:px-6 py-3 xl:py-3.5' : 'px-4 sm:px-5 xl:px-6 py-2.5 xl:py-3.5'}`}
      style={{ background: colors.bg, flexGrow }}
    >
      <div className="relative" data-slide-chunk-body="true">
        <div
          data-slide-line-anchor="true"
          data-section-idx={chunk.sectionIdx}
          data-orig-line={-1}
          className="relative isolate flex items-center gap-2 mb-1.5"
        >
          <StrokeLayer strokes={headerStrokes} coordMode="em" renderKind="highlighter" />
          <div
            className="relative z-[1] inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 whitespace-nowrap"
            style={{ backgroundColor: colors.pillBg }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: colors.bd }}
              aria-hidden="true"
            />
            <h2
              className="font-display text-[clamp(13px,0.78em,18px)] font-semibold leading-tight"
              style={{ color: colors.lb }}
            >
              {chunk.label}
              {chunk.continuation ? ' (cont.)' : ''}
            </h2>
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
                  <ChordLine
                    line={line}
                    onChordTap={noopChordTap}
                    displayMode={displayMode}
                    interactiveChords={false}
                    inChorus={isChorus}
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

interface SlideshowViewProps {
  songs: ParsedSong[];
  initialSongId?: string | null;
  activeSetlist?: Setlist | null;
  /** Optional initial transpose carried over from the active song page (applies to initialSongId only). */
  initialTranspose?: number;
  initialUseFlats?: boolean;
  onExit: (currentSongId: string) => void;
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
  anchorPoint: { x: number; y: number };
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

export function SlideshowView({
  songs,
  initialSongId = null,
  activeSetlist = null,
  initialTranspose = 0,
  initialUseFlats = false,
  onExit,
}: SlideshowViewProps) {
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

  const annotationsBySong = useAnnotationStore((s) => s.bySong);
  const historyBySong = useAnnotationStore((s) => s.historyBySong);
  const fetchSongAnnotations = useAnnotationStore((s) => s.fetchSongAnnotations);
  const flushPendingSync = useAnnotationStore((s) => s.flushPendingSync);
  const addStroke = useAnnotationStore((s) => s.addStroke);
  const removeStroke = useAnnotationStore((s) => s.removeStroke);
  const addTextNote = useAnnotationStore((s) => s.addTextNote);
  const updateTextNote = useAnnotationStore((s) => s.updateTextNote);
  const removeTextNote = useAnnotationStore((s) => s.removeTextNote);
  const pushManualSnapshot = useAnnotationStore((s) => s.pushManualSnapshot);
  const clearSongAnnotations = useAnnotationStore((s) => s.clearSongAnnotations);
  const undoAnnotations = useAnnotationStore((s) => s.undo);
  const redoAnnotations = useAnnotationStore((s) => s.redo);

  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, getServerDark);
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);

  // Keep iPad / phone screen awake automatically while in Slideshow mode
  useWakeLock(true);

  const initialResolvedId = useMemo(() => {
    if (initialSongId && songs.some((s) => s.id === initialSongId)) return initialSongId;
    return songs[0]?.id ?? '';
  }, [songs, initialSongId]);

  // Track active song by stable ID so reordering inside SetlistDrawer never swaps the live sheet
  const [activeSongId, setActiveSongId] = useState(initialResolvedId);
  const [colsPref, setColsPref] = useState<'auto' | 1 | 2>('auto');
  // Slideshow zoom stays independent of global SongPage fontSize so Auto reset never clobbers reading prefs
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
  const [showSetlistDrawer, setShowSetlistDrawer] = useState(false);
  const [showFontPopover, setShowFontPopover] = useState(false);
  const fontPopoverRef = useRef<HTMLDivElement>(null);

  // Annotation studio state
  const [annotateMode, setAnnotateMode] = useState(false);
  const [annotateTool, setAnnotateTool] = useState<AnnotateTool>('pen');
  const [annotateTone, setAnnotateTone] = useState<NoteTone>('amber');
  const [liveStroke, setLiveStroke] = useState<{
    tool: StrokeTool;
    tone: NoteTone;
    points: Array<{ x: number; y: number; pressure: number }>;
  } | null>(null);
  const [noteComposer, setNoteComposer] = useState<NoteComposerState | null>(null);
  const [dragNote, setDragNote] = useState<ActiveDragNoteState | null>(null);
  const [undoSnackbar, setUndoSnackbar] = useState<{ songId: string; message: string; seq: number } | null>(
    null
  );

  // Crisp page-turn directional feedback + boundary nudge + song-change cue pill
  const [turnAnim, setTurnAnim] = useState<{ dir: 'next' | 'prev' | 'none'; seq: number }>({
    dir: 'none',
    seq: 0,
  });
  const [bumpDir, setBumpDir] = useState<'left' | 'right' | null>(null);
  const [edgeFlash, setEdgeFlash] = useState<{ side: 'left' | 'right'; seq: number } | null>(null);
  const [songBanner, setSongBanner] = useState<{ text: string; seq: number } | null>(null);
  const [liveStatus, setLiveStatus] = useState('');

  const stageInnerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const swipeLayerRef = useRef<HTMLDivElement>(null);
  const annotateToggleRef = useRef<HTMLButtonElement>(null);
  const touchRef = useRef<{
    x: number;
    y: number;
    t: number;
    horizontal: boolean;
    moved: boolean;
  } | null>(null);
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
  const bumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snackbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((msg: string) => {
    liveParityRef.current = !liveParityRef.current;
    setLiveStatus(liveParityRef.current ? msg : `${msg}\u00A0`);
  }, []);

  const showUndoToast = useCallback((songId: string, message: string, durationMs = 4500) => {
    setUndoSnackbar((prev) => ({ songId, message, seq: (prev?.seq ?? 0) + 1 }));
    if (snackbarTimerRef.current) clearTimeout(snackbarTimerRef.current);
    snackbarTimerRef.current = setTimeout(() => setUndoSnackbar(null), durationMs);
  }, []);

  // Ensure persisted slide annotations are hydrated and pending writes flush on lifecycle/online events
  useEffect(() => {
    void useAnnotationStore.persist.rehydrate();

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void flushPendingSync(undefined, { keepalive: true });
      }
    };
    const onPageHide = () => {
      void flushPendingSync(undefined, { keepalive: true });
    };
    const onOnline = () => {
      void flushPendingSync();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('online', onOnline);
      void flushPendingSync(undefined, { keepalive: true });
    };
  }, [flushPendingSync]);

  // Resolve current index safely from activeSongId (survives SetlistDrawer reorders cleanly)
  const safeSongIdx = useMemo(() => {
    const idx = songs.findIndex((s) => s.id === activeSongId);
    return idx >= 0 ? idx : 0;
  }, [songs, activeSongId]);

  const rawSong = songs[safeSongIdx] ?? songs[0];

  // Fetch remote annotations once per song when opened
  useEffect(() => {
    if (rawSong?.id) {
      void fetchSongAnnotations(rawSong.id);
    }
  }, [rawSong?.id, fetchSongAnnotations]);

  // Keep ?song=<id> in URL synced silently so an iPadOS Safari tab reload restores the current gig song
  useEffect(() => {
    if (!activeSetlist || !rawSong || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('song') !== rawSong.id) {
      url.searchParams.set('song', rawSong.id);
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    }
  }, [activeSetlist, rawSong]);

  // Accurate musical transposition matching SongPage + ChordBadge
  const { displayedKey, shiftedSections } = useMemo(() => {
    if (!rawSong) return { displayedKey: '', shiftedSections: [] };
    const isInitialSong = initialSongId ? rawSong.id === initialSongId : safeSongIdx === 0;
    const baseTranspose = isInitialSong ? initialTranspose : 0;
    const keyFlats =
      isInitialSong && initialTranspose !== 0
        ? initialUseFlats
        : shouldPreferFlats(rawSong.displayKey);
    const nextDisplayedKey = baseTranspose
      ? transposeChord(rawSong.displayKey, baseTranspose, keyFlats)
      : rawSong.displayKey;

    const chordShift =
      baseTranspose + (rawSong.capo > 0 && capoDisplay === 'shapes' ? 0 : rawSong.capo);
    const chordFlats =
      isInitialSong && initialTranspose !== 0
        ? initialUseFlats
        : shouldPreferFlats(nextDisplayedKey);

    const sections =
      chordShift === 0
        ? rawSong.sections
        : rawSong.sections.map((sec) => ({
            ...sec,
            lines: sec.lines.map((line) => transposeLine(line, chordShift, chordFlats)),
          }));

    return { displayedKey: nextDisplayedKey, shiftedSections: sections };
  }, [rawSong, initialSongId, safeSongIdx, initialTranspose, initialUseFlats, capoDisplay]);

  const preparedSections = useMemo(
    () => prepareSlideSections(shiftedSections, displayMode),
    [shiftedSections, displayMode]
  );

  // Landscape tablets (>= 900px), wide portrait tablets (>= 960px, e.g. iPad Pro 13"), & wide landscape phones support 2 columns
  const canUseTwoCols =
    stageBox.width >= 900 || (stageBox.width >= 720 && stageBox.width > stageBox.height * 1.3);
  const effectiveCols: 1 | 2 = useMemo(() => {
    if (!canUseTwoCols) return 1;
    if (colsPref === 1 || colsPref === 2) return colsPref;
    return stageBox.width > stageBox.height || stageBox.width >= 960 ? 2 : 1;
  }, [canUseTwoCols, colsPref, stageBox.width, stageBox.height]);

  const colGapPx = stageBox.width >= 1280 ? 16 : COL_GAP_PX;
  const cardGapPx = stageBox.height > 0 && stageBox.height < 420 ? 8 : CARD_GAP_PX;

  // Full-bleed column width: always use 100% of available stage width (zero artificial max-w cap)
  const measureColWidth = useMemo(() => {
    if (stageBox.width <= 0) return 0;
    if (effectiveCols === 2) {
      return Math.max(240, Math.floor((stageBox.width - colGapPx) / 2));
    }
    return Math.max(240, Math.floor(stageBox.width));
  }, [stageBox.width, effectiveCols, colGapPx]);

  // Observe viewport/orientation resizes on the slide canvas
  useEffect(() => {
    const el = stageInnerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      setStageBox((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('orientationchange', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  // Re-measure once Google Sans web fonts settle so line wrap metrics are exact
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
  const layoutKey = `${rawSong?.id ?? ''}|${displayMode}|${stageBox.width}x${stageBox.height}|${effectiveCols}|${baseFontSize}|${fitMode}|${fontsTick}`;
  const activeProbe =
    fitMode === 'auto' && measureProbe && measureProbe.key === layoutKey ? measureProbe : null;
  const mirrorFontSize = activeProbe ? activeProbe.scale : baseFontSize;

  // Measure pure rendered card & line heights in hidden mirror + run deterministic 2-to-3-pass Auto-Fit
  useLayoutEffect(() => {
    if (!rawSong || stageBox.height <= 0 || measureColWidth <= 0) return;
    const targetSongId = rawSong.id;

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
          metrics.push({
            fullHeight: pureFullHeight,
            chromeHeight: pureFullHeight,
            lineHeights: [],
          });
          return;
        }

        const wrapRect = linesWrap.getBoundingClientRect();
        const chromeHeight = Math.ceil(secRect.height - wrapRect.height) + 2;
        const lineHeights: number[] = [];
        const textRange = typeof document !== 'undefined' ? document.createRange() : null;
        lineEls.forEach((lineEl, idx) => {
          const lr = lineEl.getBoundingClientRect();
          const lh = Math.ceil(lr.height);
          lineHeights.push(lh + (idx > 0 ? lineGap : 0));

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
            if (lineW > 0) {
              lineWidthRatios.push(lineW / innerCardWidth);
            }
          }
        });
        metrics.push({ fullHeight: pureFullHeight, chromeHeight, lineHeights });
      });

      // Use 90th-percentile line width so one stray long lyric line never blocks Auto-Fit scale-up
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
        // On ultra-short landscape phones (< 360px stage height) with many pages, keep font compact rather than inflating turns
        if (stageBox.height < 360 && stats.pageCount > 4) return null;
        // Single-page songs are bounded directly by maxColFill; multi-page songs can reflow
        // across page boundaries, so avgColFill captures the real headroom within the same page count.
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
            ? Math.min(displayMode === 'both' ? 1.56 : 1.52, 0.99 / p90WidthRatio)
            : displayMode === 'lyrics-only'
            ? 1.52
            : 1.48;
        const maxFactor = effectiveCols === 2 && stageBox.width >= 1280 ? 1.48 : 1.56;
        const boundedFactor = Math.max(1, Math.min(maxFactor, Math.min(vertFactor, horizCap)));
        const candidate = Math.min(
          AUTO_FIT_MAX_FONT,
          Math.max(baseFontSize, Math.round((baseFontSize * boundedFactor) / 2) * 2)
        );
        return candidate >= baseFontSize + 4 ? candidate : null;
      };

      if (fitMode === 'auto') {
        if (!activeProbe) {
          // Pass 1 (100% baseline): check whether a gentle shrink folds a light trailing page cleanly.
          // Note: spillPages can be <= 0 after penultimate-to-last balancing if total content fits in pageCount - 1!
          const pageEquiv = stats.totalCapacityFill * stats.pageCount;
          const spillPages = pageEquiv - (stats.pageCount - 1);
          const hasFoldableTail =
            stats.pageCount > 1 &&
            (stats.lastSlideTotalFill < 0.38 ||
              stats.lastSlideFill < 0.40 ||
              spillPages < 0.30);

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
              setMeasureProbe({
                ...activeProbe,
                scale: minAutoFont,
                phase: 'shrink2',
              });
              return;
            }
            // Even minAutoFont couldn't eliminate the trailing page -> return to clean baseline (or baselineGrow)
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
            setMeasureProbe({
              ...activeProbe,
              scale: baseFontSize,
              phase: 'lock',
            });
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
    rawSong,
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

  // Dismiss mobile font zoom popover on outside click or Escape
  useEffect(() => {
    if (!showFontPopover) return;
    const onPointerDown = (e: PointerEvent) => {
      if (fontPopoverRef.current && e.target instanceof Node && !fontPopoverRef.current.contains(e.target)) {
        setShowFontPopover(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowFontPopover(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [showFontPopover]);

  const isLayoutSynced = Boolean(rawSong && deckLayout.songId === rawSong.id);
  const pages = isLayoutSynced ? deckLayout.pages : [];
  const totalPages = Math.max(1, pages.length);
  const safePageIdx = isLayoutSynced
    ? Math.min(Math.max(0, deckLayout.pageIdx), totalPages - 1)
    : 0;
  const activeSlide = isLayoutSynced ? pages[safePageIdx] ?? null : null;
  const activeFontSize = isLayoutSynced ? deckLayout.effectiveFontSize : baseFontSize;

  // Partition active song's annotations into fast O(1) section/line lookup maps + page-level overlays
  const songAnnotations = rawSong ? annotationsBySong[rawSong.id] : undefined;
  const songStrokes = songAnnotations?.strokes ?? EMPTY_STROKES;
  const songNotes = songAnnotations?.notes ?? EMPTY_NOTES;
  const totalAnnotationCount = songStrokes.length + songNotes.length;
  const canUndoAnnotations = Boolean(rawSong && (historyBySong[rawSong.id]?.past.length ?? 0) > 0);
  const canRedoAnnotations = Boolean(rawSong && (historyBySong[rawSong.id]?.future.length ?? 0) > 0);

  const { strokesByAnchor, notesByAnchor, pageStrokes, pageNotes } = useMemo(() => {
    const sMap = new Map<string, InkStroke[]>();
    const nMap = new Map<string, TextNote[]>();
    const pStrokes: InkStroke[] = [];
    const pNotes: TextNote[] = [];

    // Track which (sectionIdx, origLineIdx) lines exist in the active displayMode so section TextNotes
    // attached to filtered-out lines fall back cleanly to the section header instead of vanishing.
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
      } else {
        const clampedPage = Math.min(s.anchor.pageIdx, totalPages - 1);
        if (clampedPage === safePageIdx) {
          pStrokes.push(s);
        }
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
      } else {
        const clampedPage = Math.min(n.anchor.pageIdx, totalPages - 1);
        if (clampedPage === safePageIdx) {
          pNotes.push(n);
        }
      }
    }

    return {
      strokesByAnchor: sMap,
      notesByAnchor: nMap,
      pageStrokes: pStrokes,
      pageNotes: pNotes,
    };
  }, [songStrokes, songNotes, preparedSections, safePageIdx, totalPages]);

  // Visible section list on the active slide (drives WCAG 2.5.7 non-drag note repositioning)
  const visibleSectionOptions: SectionMoveOption[] = useMemo(() => {
    if (!activeSlide) return [];
    const seen = new Set<number>();
    const opts: SectionMoveOption[] = [];
    for (const col of activeSlide.columns) {
      for (const chunk of col) {
        if (!seen.has(chunk.sectionIdx)) {
          seen.add(chunk.sectionIdx);
          opts.push({ sectionIdx: chunk.sectionIdx, label: chunk.label });
        }
      }
    }
    return opts;
  }, [activeSlide]);

  // Keep reading anchor synchronized with the currently visible slide
  useEffect(() => {
    if (!activeSlide) return;
    currentAnchorRef.current = {
      sectionIdx: activeSlide.anchorSectionIdx,
      lineIdx: activeSlide.anchorLineIdx,
    };
  }, [activeSlide]);

  const atDeckStart = safeSongIdx === 0 && safePageIdx === 0;
  const atDeckEnd = safeSongIdx === songs.length - 1 && safePageIdx >= totalPages - 1;
  const nextSong = safeSongIdx < songs.length - 1 ? songs[safeSongIdx + 1] : null;
  const prevSong = safeSongIdx > 0 ? songs[safeSongIdx - 1] : null;
  const isLastPageOfSong = isLayoutSynced && safePageIdx >= totalPages - 1;

  const cancelActiveGestures = useCallback(() => {
    drawingRef.current = null;
    erasingRef.current = null;
    setLiveStroke(null);
    setDragNote(null);
    setNoteComposer(null);
  }, []);

  const triggerBump = useCallback((dir: 'left' | 'right') => {
    if (prefersReducedMotion()) return;
    setBumpDir(null);
    requestAnimationFrame(() => {
      setBumpDir(dir);
      if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
      bumpTimerRef.current = setTimeout(() => setBumpDir(null), 210);
    });
  }, []);

  const flashEdge = useCallback((side: 'left' | 'right') => {
    if (prefersReducedMotion()) return;
    setEdgeFlash((prev) => ({ side, seq: (prev?.seq ?? 0) + 1 }));
    if (edgeTimerRef.current) clearTimeout(edgeTimerRef.current);
    edgeTimerRef.current = setTimeout(() => setEdgeFlash(null), 300);
  }, []);

  // Functional wayfinding pill stays active under reduced motion (CSS disables its animation)
  const showSongBoundaryBanner = useCallback(
    (idx: number, song: ParsedSong) => {
      const keyPart = song.displayKey ? ` · ${song.displayKey}` : '';
      const prefix = songs.length > 1 ? `${idx + 1}/${songs.length} · ` : '';
      setSongBanner((prev) => ({
        text: `${prefix}${song.title}${keyPart}`,
        seq: (prev?.seq ?? 0) + 1,
      }));
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = setTimeout(() => setSongBanner(null), 1400);
    },
    [songs.length]
  );

  const goNext = useCallback(() => {
    if (!isLayoutSynced) return;
    cancelActiveGestures();
    if (safePageIdx < totalPages - 1) {
      const nextP = safePageIdx + 1;
      setDeckLayout((prev) => ({ ...prev, pageIdx: nextP }));
      setTurnAnim((prev) => ({ dir: 'next', seq: prev.seq + 1 }));
      flashEdge('right');
      announce(`Página ${nextP + 1} de ${totalPages}`);
      return;
    }
    if (safeSongIdx < songs.length - 1) {
      const targetIdx = safeSongIdx + 1;
      const targetSong = songs[targetIdx];
      pendingPageRef.current = {
        kind: 'first',
        announceSong: `Próxima música: ${targetSong.title}`,
      };
      currentAnchorRef.current = { sectionIdx: 0, lineIdx: 0 };
      setFitMode('auto');
      setMeasureProbe(null);
      setActiveSongId(targetSong.id);
      setTurnAnim((prev) => ({ dir: 'next', seq: prev.seq + 1 }));
      flashEdge('right');
      showSongBoundaryBanner(targetIdx, targetSong);
      return;
    }
    triggerBump('right');
    announce('Fim da apresentação');
  }, [
    isLayoutSynced,
    cancelActiveGestures,
    safePageIdx,
    totalPages,
    safeSongIdx,
    songs,
    flashEdge,
    announce,
    showSongBoundaryBanner,
    triggerBump,
  ]);

  const goPrev = useCallback(() => {
    if (!isLayoutSynced) return;
    cancelActiveGestures();
    if (safePageIdx > 0) {
      const prevP = safePageIdx - 1;
      setDeckLayout((prev) => ({ ...prev, pageIdx: prevP }));
      setTurnAnim((prev) => ({ dir: 'prev', seq: prev.seq + 1 }));
      flashEdge('left');
      announce(`Página ${prevP + 1} de ${totalPages}`);
      return;
    }
    if (safeSongIdx > 0) {
      const targetIdx = safeSongIdx - 1;
      const targetSong = songs[targetIdx];
      pendingPageRef.current = {
        kind: 'last',
        announceSong: `Música anterior: ${targetSong.title}`,
      };
      currentAnchorRef.current = { sectionIdx: 0, lineIdx: 0 };
      setFitMode('auto');
      setMeasureProbe(null);
      setActiveSongId(targetSong.id);
      setTurnAnim((prev) => ({ dir: 'prev', seq: prev.seq + 1 }));
      flashEdge('left');
      showSongBoundaryBanner(targetIdx, targetSong);
      return;
    }
    triggerBump('left');
    announce('Início da apresentação');
  }, [
    isLayoutSynced,
    cancelActiveGestures,
    safePageIdx,
    totalPages,
    safeSongIdx,
    songs,
    flashEdge,
    announce,
    showSongBoundaryBanner,
    triggerBump,
  ]);

  const jumpToSongById = useCallback(
    (targetSongId: string) => {
      const idx = songs.findIndex((s) => s.id === targetSongId);
      if (idx < 0 || idx === safeSongIdx) return;
      cancelActiveGestures();
      const targetSong = songs[idx];
      const dir = idx > safeSongIdx ? 'next' : 'prev';
      pendingPageRef.current = { kind: 'first', announceSong: targetSong.title };
      currentAnchorRef.current = { sectionIdx: 0, lineIdx: 0 };
      setFitMode('auto');
      setMeasureProbe(null);
      setActiveSongId(targetSong.id);
      setTurnAnim((prev) => ({ dir, seq: prev.seq + 1 }));
      showSongBoundaryBanner(idx, targetSong);
    },
    [songs, safeSongIdx, cancelActiveGestures, showSongBoundaryBanner]
  );

  // Resolve exact musical line/header anchor (reading true computed em px + snapping nearby gap taps)
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

      // Always snap open-margin taps/strokes to the nearest visible section card so annotations stay
      // portable across devices with different page counts (e.g. 10-page iPhone -> 2-page 1080p).
      if (!directEl) {
        const chunks = stageEl.querySelectorAll<HTMLElement>('[data-slide-chunk="true"]');
        let nearestCard: HTMLElement | null = null;
        let nearestCardDist = Infinity;
        for (let i = 0; i < chunks.length; i++) {
          const card = chunks[i];
          const cr = card.getBoundingClientRect();
          const dx = Math.max(cr.left - clientX, 0, clientX - cr.right);
          const dy = Math.max(cr.top - clientY, 0, clientY - cr.bottom);
          const dist = Math.hypot(dx, dy);
          if (dist < nearestCardDist) {
            nearestCardDist = dist;
            nearestCard = card;
          }
        }
        if (nearestCard) {
          const cardAnchors = nearestCard.querySelectorAll<HTMLElement>('[data-slide-line-anchor="true"]');
          let bestDist = Infinity;
          cardAnchors.forEach((a) => {
            const ar = a.getBoundingClientRect();
            const cy = (ar.top + ar.bottom) / 2;
            const d = Math.abs(clientY - cy);
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

      // Open canvas / margin fallback -> stage page anchor
      const stageRect = stageEl.getBoundingClientRect();
      const xFrac = round3(
        Math.max(0.02, Math.min(0.98, (clientX - stageRect.left) / Math.max(1, stageRect.width)))
      );
      const yFrac = round3(
        Math.max(0.02, Math.min(0.98, (clientY - stageRect.top) / Math.max(1, stageRect.height)))
      );
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

  // Geometric hit-test for batched Eraser scrubbing across both SVG strokes and text note chips
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
        if (
          clientX >= r.left - 6 &&
          clientX <= r.right + 6 &&
          clientY >= r.top - 6 &&
          clientY <= r.bottom + 6
        ) {
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
        const isHi = pathEl.getAttribute('data-stroke-tool') === 'highlighter';
        const hitRadius = isHi ? 22 : 16;
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
        let hit = false;
        for (let s = 0; s <= steps; s++) {
          const pt = pathEl.getPointAtLength((totalLen * s) / steps);
          const sx = pt.x * ctm.a + pt.y * ctm.c + ctm.e;
          const sy = pt.x * ctm.b + pt.y * ctm.d + ctm.f;
          if (Math.hypot(clientX - sx, clientY - sy) <= hitRadius) {
            hit = true;
            break;
          }
        }
        if (hit) {
          er.erasedIds.add(id);
          er.didErase = true;
          removeStroke(er.songId, id, { skipHistory: true });
          announce('Traço apagado');
          return;
        }
      }
    },
    [removeTextNote, removeStroke, announce]
  );

  // Stage pointer handlers for Annotate Mode + automatic Apple Pencil instant draw + palm rejection
  const handleStagePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!rawSong || showSetlistDrawer || noteComposer) return;
    if (e.button > 0) return;

    // Palm / secondary pointer rejection: never overwrite an active pen stroke, erase, or note drag
    if (drawingRef.current || erasingRef.current || dragNote) return;

    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('button, a, textarea, input, select, [role="dialog"]')) return;

    const isApplePencil = e.pointerType === 'pen';
    if (isApplePencil) {
      lastPenActivityAtRef.current = Date.now();
    } else if (Date.now() - lastPenActivityAtRef.current < 320) {
      // Ignore stray palm touch immediately after lifting Apple Pencil
      return;
    }

    if (!annotateMode && !isApplePencil) return;

    const stageEl = stageInnerRef.current;
    if (!stageEl) return;
    const stageRect = stageEl.getBoundingClientRect();

    const effectiveTool: AnnotateTool = !annotateMode && isApplePencil ? 'pen' : annotateTool;

    if (effectiveTool === 'text') {
      e.preventDefault();
      const hit = resolveAnchorAtPoint(e.clientX, e.clientY);
      setNoteComposer({
        mode: 'create',
        anchor: hit.anchor,
        x: hit.noteX,
        y: hit.originY,
        align: hit.noteAlign,
        initialText: '',
        initialTone: annotateTone,
        anchorPoint: { x: e.clientX, y: e.clientY },
      });
      return;
    }

    if (effectiveTool === 'eraser') {
      e.preventDefault();
      erasingRef.current = {
        songId: rawSong.id,
        pointerId: e.pointerId,
        erasedIds: new Set<string>(),
        preSnapshot: { strokes: songStrokes, notes: songNotes },
        didErase: false,
      };
      trySetPointerCapture(e.currentTarget, e.pointerId);
      eraseAtPoint(e.clientX, e.clientY);
      return;
    }

    // Pen or Highlighter stroke start
    e.preventDefault();
    const startHit = resolveAnchorAtPoint(e.clientX, e.clientY);
    const localX = e.clientX - stageRect.left;
    const localY = e.clientY - stageRect.top;
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    const initialPts = [{ x: localX, y: localY, pressure }];

    drawingRef.current = {
      songId: rawSong.id,
      pointerId: e.pointerId,
      isPencilInstant: !annotateMode && isApplePencil,
      tool: effectiveTool,
      tone: annotateTone,
      stageRect,
      startHit,
      startLocalX: localX,
      startLocalY: localY,
      points: initialPts,
    };
    setLiveStroke({ tool: effectiveTool, tone: annotateTone, points: initialPts });
    trySetPointerCapture(e.currentTarget, e.pointerId);
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (dragNote && dragNote.pointerId === e.pointerId) {
      e.preventDefault();
      const moved =
        dragNote.moved ||
        Math.hypot(e.clientX - dragNote.startX, e.clientY - dragNote.startY) > 6;
      setDragNote((prev) =>
        prev ? { ...prev, curX: e.clientX, curY: e.clientY, moved } : null
      );
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
    if (e.pointerType === 'pen') {
      lastPenActivityAtRef.current = Date.now();
    }

    const localX = e.clientX - draw.stageRect.left;
    const localY = e.clientY - draw.stageRect.top;
    const last = draw.points[draw.points.length - 1];
    if (last && Math.hypot(localX - last.x, localY - last.y) < 1.5) return;

    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    draw.points.push({ x: localX, y: localY, pressure });
    setLiveStroke({
      tool: draw.tool,
      tone: draw.tone,
      points: [...draw.points],
    });
  };

  const finishStagePointer = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    if (e.pointerType === 'pen') {
      lastPenActivityAtRef.current = Date.now();
    }

    if (dragNote && dragNote.pointerId === e.pointerId) {
      const finished = dragNote;
      setDragNote(null);
      if (!cancelled) {
        if (finished.moved) {
          // Drop at true chip position (preserving initial grab offset)
          const dropLeft = e.clientX - finished.grabDx;
          const dropCenterY = e.clientY - finished.grabDy + finished.origRect.height / 2;
          const dropProbeX =
            finished.note.align === 'right'
              ? dropLeft + finished.origRect.width
              : dropLeft;
          const hit = resolveAnchorAtPoint(dropProbeX, dropCenterY);
          updateTextNote(finished.songId, finished.note.id, {
            anchor: hit.anchor,
            x: hit.noteX,
            y: hit.originY,
            align: hit.noteAlign,
          });
          announce('Nota reposicionada');
        } else {
          setNoteComposer({
            mode: 'edit',
            noteId: finished.note.id,
            anchor: finished.note.anchor,
            x: finished.note.x,
            y: finished.note.y,
            align: finished.note.align ?? 'left',
            initialText: finished.note.text,
            initialTone: finished.note.tone,
            anchorPoint: {
              x: finished.origRect.left + finished.origRect.width / 2,
              y: finished.origRect.bottom,
            },
          });
        }
      }
      return;
    }

    if (erasingRef.current && erasingRef.current.pointerId === e.pointerId) {
      const finishedErase = erasingRef.current;
      erasingRef.current = null;
      if (finishedErase.didErase) {
        pushManualSnapshot(finishedErase.songId, finishedErase.preSnapshot);
      }
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

    const stroke: InkStroke = {
      id: makeId('ink'),
      tool: draw.tool,
      tone: draw.tone,
      anchor: draw.startHit.anchor,
      originX: draw.startHit.originX,
      originY: draw.startHit.originY,
      points: relPoints,
      createdAt: Date.now(),
    };
    addStroke(draw.songId, stroke);

    if (draw.isPencilInstant) {
      showUndoToast(draw.songId, 'Traço salvo', 3500);
    }
  };

  const handleStartDragNote = useCallback(
    (note: TextNote, e: React.PointerEvent<HTMLButtonElement>) => {
      if (!rawSong || !annotateMode) return;
      if (drawingRef.current || erasingRef.current || dragNote) return;

      if (annotateTool === 'eraser') {
        // Start a continuous batched eraser sweep directly from the tapped note chip
        const preSnapshot = { strokes: songStrokes, notes: songNotes };
        const erasedIds = new Set<string>([note.id]);
        erasingRef.current = {
          songId: rawSong.id,
          pointerId: e.pointerId,
          erasedIds,
          preSnapshot,
          didErase: true,
        };
        removeTextNote(rawSong.id, note.id, { skipHistory: true });
        announce('Nota apagada');
        trySetPointerCapture(stageInnerRef.current?.parentElement ?? null, e.pointerId);
        return;
      }

      const origRect = e.currentTarget.getBoundingClientRect();
      setDragNote({
        songId: rawSong.id,
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
    [rawSong, annotateMode, annotateTool, dragNote, songStrokes, songNotes, removeTextNote, announce]
  );

  const handleTapNote = useCallback(
    (note: TextNote, rect: DOMRect) => {
      if (!rawSong || !annotateMode) return;
      if (annotateTool === 'eraser') {
        removeTextNote(rawSong.id, note.id);
        announce('Nota apagada');
        return;
      }
      setNoteComposer({
        mode: 'edit',
        noteId: note.id,
        anchor: note.anchor,
        x: note.x,
        y: note.y,
        align: note.align ?? 'left',
        initialText: note.text,
        initialTone: note.tone,
        anchorPoint: { x: rect.left + rect.width / 2, y: rect.bottom },
      });
    },
    [rawSong, annotateMode, annotateTool, removeTextNote, announce]
  );

  // Keyboard & VoiceOver note creation anchored cleanly to the first visible section on the slide
  const openKeyboardNewNote = useCallback(() => {
    const firstOpt = visibleSectionOptions[0];
    const stageRect = stageInnerRef.current?.getBoundingClientRect();
    const cx = stageRect ? stageRect.left + stageRect.width * 0.5 : 512;
    const cy = stageRect ? stageRect.top + 120 : 200;
    setNoteComposer({
      mode: 'create',
      anchor: firstOpt
        ? { kind: 'section', sectionIdx: firstOpt.sectionIdx, origLineIdx: -1 }
        : { kind: 'page', pageIdx: safePageIdx },
      x: firstOpt ? 1 : 0.72,
      y: firstOpt ? 0.6 : 0.14,
      align: 'right',
      initialText: '',
      initialTone: annotateTone,
      anchorPoint: { x: cx, y: cy },
    });
  }, [visibleSectionOptions, safePageIdx, annotateTone]);

  // Bluetooth page-turner pedals (AirTurn, PageFlip, Donner, presenters) + keyboard + Undo/Redo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      // Cmd/Ctrl+Z undo & Cmd/Ctrl+Shift+Z redo work in both Annotate and Reading modes (e.g. after Apple Pencil)
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'z' && !noteComposer) {
        if (rawSong && (annotateMode || canUndoAnnotations || canRedoAnnotations)) {
          e.preventDefault();
          const ok = e.shiftKey ? redoAnnotations(rawSong.id) : undoAnnotations(rawSong.id);
          if (ok) {
            setUndoSnackbar(null);
            announce(e.shiftKey ? 'Anotação refeita' : 'Anotação desfeita');
          }
        }
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const modalOpen = Boolean(
        showSetlistDrawer || noteComposer || document.querySelector('[role="dialog"][aria-modal="true"]')
      );

      if (e.key === 'Escape') {
        if (modalOpen) return;
        e.preventDefault();
        if (annotateMode) {
          cancelActiveGestures();
          setAnnotateMode(false);
          if (rawSong) void flushPendingSync(rawSong.id);
          announce('Modo de anotação encerrado');
          requestAnimationFrame(() => annotateToggleRef.current?.focus());
          return;
        }
        if (rawSong) {
          void flushPendingSync(rawSong.id, { keepalive: true });
          onExit(rawSong.id);
        }
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

      const onControl = Boolean(
        targetEl?.closest(
          'button, a, select, [role="button"], [role="option"], [role="switch"], [role="menuitem"]'
        )
      );

      const allowSpace = singleKeyShortcuts && !onControl;

      const isForwardKey =
        e.key === 'PageDown' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === 'MediaTrackNext' ||
        (!e.shiftKey && allowSpace && e.key === ' ') ||
        (!e.shiftKey && !onControl && e.key === 'Enter');

      const isBackwardKey =
        e.key === 'PageUp' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowUp' ||
        e.key === 'Backspace' ||
        e.key === 'MediaTrackPrevious' ||
        (e.shiftKey && allowSpace && e.key === ' ');

      if (!isForwardKey && !isBackwardKey) return;

      e.preventDefault();
      if (e.repeat) return;

      const now = performance.now();
      if (now - lastKeyAtRef.current < KEY_DEBOUNCE_MS) return;
      lastKeyAtRef.current = now;

      if (isForwardKey) goNext();
      else goPrev();
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    showSetlistDrawer,
    noteComposer,
    annotateMode,
    canUndoAnnotations,
    canRedoAnnotations,
    singleKeyShortcuts,
    rawSong,
    onExit,
    goNext,
    goPrev,
    cancelActiveGestures,
    flushPendingSync,
    undoAnnotations,
    redoAnnotations,
    announce,
  ]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
      if (edgeTimerRef.current) clearTimeout(edgeTimerRef.current);
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      if (snackbarTimerRef.current) clearTimeout(snackbarTimerRef.current);
    };
  }, []);

  // Touch swipe & tap-zone handlers on the slide stage (paused during Annotate Mode and Apple Pencil strokes)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (annotateMode || showSetlistDrawer || noteComposer || drawingRef.current) return;
    if (Date.now() - lastPenActivityAtRef.current < PEN_SUPPRESS_MS) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (isStylusTouch(t)) {
      lastPenActivityAtRef.current = Date.now();
      touchRef.current = null;
      return;
    }
    if (t.clientX < EDGE_GUARD_PX || t.clientX > window.innerWidth - EDGE_GUARD_PX) {
      touchRef.current = null;
      return;
    }
    touchRef.current = {
      x: t.clientX,
      y: t.clientY,
      t: Date.now(),
      horizontal: false,
      moved: false,
    };
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

    if (!start.moved && (Math.abs(dx) > DRAG_CANCEL_PX || Math.abs(dy) > DRAG_CANCEL_PX)) {
      start.moved = true;
    }
    if (!start.horizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      start.horizontal = true;
    }
    if (!start.horizontal || !swipeLayerRef.current || prefersReducedMotion()) return;

    const resist = (dx < 0 && atDeckEnd) || (dx > 0 && atDeckStart) ? 0.16 : 0.4;
    const offset = Math.max(-72, Math.min(72, dx * resist));
    swipeLayerRef.current.style.transform = `translate3d(${offset}px, 0, 0)`;
  };

  const resetSwipeLayer = () => {
    const el = swipeLayerRef.current;
    if (!el) return;
    el.style.transition = prefersReducedMotion()
      ? ''
      : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transform = '';
  };

  const handleTouchCancel = () => {
    touchRef.current = null;
    lastSwipeAtRef.current = Date.now();
    resetSwipeLayer();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (annotateMode || drawingRef.current) {
      touchRef.current = null;
      resetSwipeLayer();
      return;
    }
    const start = touchRef.current;
    touchRef.current = null;
    resetSwipeLayer();
    if (!start || e.changedTouches.length !== 1) return;
    if (Date.now() - lastPenActivityAtRef.current < PEN_SUPPRESS_MS) return;

    const t = e.changedTouches[0];
    if (isStylusTouch(t)) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;

    if (
      dt <= SWIPE_MAX_DT &&
      Math.abs(dx) >= SWIPE_MIN_DX &&
      Math.abs(dx) > Math.abs(dy) * SWIPE_DX_DY_RATIO
    ) {
      lastSwipeAtRef.current = Date.now();
      if (dx < 0) goNext();
      else goPrev();
    } else if (start.moved) {
      lastSwipeAtRef.current = Date.now();
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

  if (!rawSong) return null;

  const minorKey = isMinorKey(displayedKey);
  const keyToneClasses = minorKey
    ? 'bg-[var(--minor-container)] text-[var(--on-minor-container)]'
    : 'bg-[var(--primary-container)] text-[var(--on-primary-container)]';

  const slideAnimClass =
    bumpDir === 'left'
      ? 'gm3-slide-bump-left'
      : bumpDir === 'right'
      ? 'gm3-slide-bump-right'
      : turnAnim.dir === 'next'
      ? 'gm3-slide-enter-next'
      : turnAnim.dir === 'prev'
      ? 'gm3-slide-enter-prev'
      : '';

  const singleSpread = activeSlide && activeSlide.columns.length <= 1;
  const usableStageH = Math.max(140, stageBox.height - HEIGHT_SAFETY_PX);

  const prevAriaLabel =
    safePageIdx === 0 && prevSong ? `Música anterior: ${prevSong.title}` : 'Página anterior';
  const nextAriaLabel =
    isLastPageOfSong && nextSong ? `Próxima música: ${nextSong.title}` : 'Próxima página';

  const handleAdjustFont = (delta: number, e: React.MouseEvent<HTMLButtonElement>) => {
    blurOnPointer(e);
    const base = fitMode === 'auto' ? Math.round(activeFontSize / 10) * 10 : manualFontSize;
    const next = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, base + delta));
    if (fitMode === 'manual' && next === manualFontSize) {
      announce(delta < 0 ? `Fonte no mínimo (${MIN_FONT_SIZE}%)` : `Fonte no máximo (${MAX_FONT_SIZE}%)`);
      return;
    }
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
    announce('Auto: ajuste automático de tela ativado');
  };

  const handleToggleCapo = (e: React.MouseEvent<HTMLButtonElement>) => {
    blurOnPointer(e);
    const next = capoDisplay === 'shapes' ? 'sounding' : 'shapes';
    pendingPageRef.current = { kind: 'anchor', ...currentAnchorRef.current };
    setCapoDisplay(next);
    announce(next === 'shapes' ? `Formas de capo ${rawSong.capo}` : 'Acordes no tom real');
  };

  const handleToggleCols = (e: React.MouseEvent<HTMLButtonElement>) => {
    blurOnPointer(e);
    const nextCols: 1 | 2 = effectiveCols === 2 ? 1 : 2;
    pendingPageRef.current = { kind: 'anchor', ...currentAnchorRef.current };
    setColsPref(nextCols);
    announce(nextCols === 2 ? '2 colunas por página' : '1 coluna por página');
  };

  const handleToggleAnnotate = (e: React.MouseEvent<HTMLButtonElement>) => {
    blurOnPointer(e);
    cancelActiveGestures();
    setAnnotateMode((prev) => {
      const next = !prev;
      if (!next) {
        void flushPendingSync(rawSong.id);
      }
      announce(next ? 'Modo de anotação ativado' : 'Modo de anotação encerrado');
      return next;
    });
  };

  const stageCursorClass = annotateMode
    ? annotateTool === 'text'
      ? 'cursor-text'
      : annotateTool === 'eraser'
      ? 'cursor-cell'
      : 'cursor-crosshair'
    : 'cursor-pointer';

  const dragToneMeta = dragNote ? NOTE_TONE_MAP[dragNote.note.tone] ?? NOTE_TONE_MAP.amber : null;

  return (
    <div
      data-motion-scheme="standard"
      data-slides-mode="true"
      data-annotate-mode={annotateMode ? 'true' : 'false'}
      data-fit-mode={fitMode}
      data-effective-font={activeFontSize}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)] text-[var(--ink)] select-none overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      {/* Accessible page-turn and annotation announcements for iPadOS VoiceOver */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </div>

      {/* Underlying shell becomes `inert` while Note Composer dialog is open so VoiceOver stays trapped inside */}
      <div
        inert={Boolean(noteComposer) || undefined}
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
      >
        {/* Ultra-slim GM3 Stage Top Bar: single-row >= 768px (md), zero clipping down to 375px */}
        <header className="flex-shrink-0 bg-[var(--bg)] px-2 sm:px-3.5 pt-1 pb-1 sm:pt-1.5">
          <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-1.5 sm:gap-2">
            {/* Left: Exit + Setlist counter + Song Title, Key, Capo & compact Annotate page indicator (< lg) */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={(e) => {
                  blurOnPointer(e);
                  void flushPendingSync(rawSong.id, { keepalive: true });
                  onExit(rawSong.id);
                }}
                aria-label="Sair do modo slides"
                title="Sair (Esc)"
                className="pill-btn h-11 min-w-11 px-2.5 sm:px-3 text-sm flex-shrink-0"
              >
                <CloseIcon size={17} />
                <span className="hidden xl:inline">Sair</span>
              </button>

              {activeSetlist && songs.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    blurOnPointer(e);
                    setShowSetlistDrawer(true);
                  }}
                  aria-haspopup="dialog"
                  aria-expanded={showSetlistDrawer}
                  aria-label={`Abrir setlist ${activeSetlist.name} (${safeSongIdx + 1} de ${songs.length})`}
                  title={`Setlist: ${activeSetlist.name}`}
                  className="pill-btn h-11 min-w-11 px-2.5 sm:px-3 text-xs font-mono tabular-nums flex-shrink-0"
                >
                  <MenuListIcon size={15} />
                  <span>
                    {safeSongIdx + 1}/{songs.length}
                  </span>
                </button>
              )}

              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                <h1
                  title={rawSong.title}
                  className="font-display font-bold text-base sm:text-lg text-[var(--ink)] truncate leading-tight"
                >
                  {rawSong.title}
                </h1>
                {displayedKey && (
                  <span
                    className={`studio-chip ${keyToneClasses} font-semibold flex-shrink-0`}
                    title={`Tom ${displayedKey}`}
                  >
                    <span className="sr-only">Tom </span>
                    {displayedKey}
                  </span>
                )}
                {annotateMode && (
                  <span
                    data-header-page-label="true"
                    className="lg:hidden studio-chip bg-[var(--surface)] text-[var(--muted)] font-mono tabular-nums flex-shrink-0"
                  >
                    {safePageIdx + 1}/{totalPages}
                  </span>
                )}
                {rawSong.capo > 0 && (
                  <button
                    type="button"
                    onClick={handleToggleCapo}
                    aria-pressed={capoDisplay === 'shapes'}
                    aria-label={
                      capoDisplay === 'shapes'
                        ? `Capo ${rawSong.capo}: mostrando posições de capo, toque para tom real`
                        : `Tom real (C${rawSong.capo}): mostrando tom real, toque para posições de capo`
                    }
                    title={
                      capoDisplay === 'shapes'
                        ? `Posições com Capo ${rawSong.capo} (toque para tom real)`
                        : `Tom real (toque para posições com Capo ${rawSong.capo})`
                    }
                    className={`pill-btn h-11 min-w-11 px-2.5 text-xs font-semibold flex-shrink-0 ${
                      capoDisplay === 'shapes'
                        ? 'bg-[var(--tune-dim)] text-[var(--tune)]'
                        : 'bg-[var(--surface)] text-[var(--tune)]'
                    }`}
                  >
                    <span className="sm:hidden">
                      {capoDisplay === 'shapes' ? `Capo ${rawSong.capo}` : 'Real'}
                    </span>
                    <span className="hidden sm:inline xl:hidden">
                      {capoDisplay === 'shapes' ? `Capo ${rawSong.capo}` : 'Tom real'}
                    </span>
                    <span className="hidden xl:inline">
                      {capoDisplay === 'shapes' ? `Capo ${rawSong.capo}` : `Tom real (C${rawSong.capo})`}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Right: Essential stage controls (Aa popover on <640px prevents 375px clipping in all states) */}
            <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 w-full md:w-auto justify-between md:justify-end">
              <ConnectedGroup value={displayMode} ariaLabel="Modo de leitura nos slides">
                {(
                  [
                    { id: 'both', label: 'Cifra' },
                    { id: 'lyrics-only', label: 'Letra' },
                    { id: 'chords-only', label: 'Acordes' },
                  ] as { id: DisplayMode; label: string }[]
                ).map((opt) => {
                  const selected = displayMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={(e) => {
                        blurOnPointer(e);
                        pendingPageRef.current = {
                          kind: 'anchor',
                          ...currentAnchorRef.current,
                        };
                        setDisplayMode(opt.id);
                        announce(`Modo ${opt.label}`);
                      }}
                      aria-pressed={selected}
                      className={`gm3-connected-btn h-11 min-w-11 px-2 sm:px-3 text-xs cursor-pointer ${
                        selected ? 'font-semibold' : 'font-medium'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </ConnectedGroup>

              {/* Phones (< 640px): single Aa popover trigger for A- / A+ / Auto (zero 375px overflow) */}
              <div ref={fontPopoverRef} className="relative sm:hidden flex-shrink-0">
                <button
                  type="button"
                  data-font-popover-trigger="true"
                  onClick={(e) => {
                    blurOnPointer(e);
                    setShowFontPopover((prev) => !prev);
                  }}
                  aria-haspopup="true"
                  aria-expanded={showFontPopover}
                  aria-label={`Tamanho da fonte (${activeFontSize}%)`}
                  title={`Fonte (${activeFontSize}%)`}
                  className={`pill-btn h-11 min-w-11 w-11 text-xs font-mono font-semibold ${
                    fitMode === 'manual' ? 'pill-btn-tonal' : ''
                  }`}
                >
                  Aa
                </button>
                {showFontPopover && (
                  <div
                    role="group"
                    aria-label="Ajustar tamanho da fonte"
                    data-font-popover="true"
                    className="gm3-header-popover absolute right-0 top-[calc(100%+6px)] z-50 p-1.5 inline-flex items-center gap-1"
                  >
                    {fitMode === 'manual' && (
                      <button
                        type="button"
                        data-autofit-reset="true"
                        onClick={(e) => {
                          handleResetAutoFit(e);
                          setShowFontPopover(false);
                        }}
                        aria-label="Auto: ajuste automático de tela"
                        className="pill-btn pill-btn-tonal h-11 min-w-11 px-2.5 text-xs font-semibold"
                      >
                        Auto
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleAdjustFont(-10, e)}
                      aria-disabled={fitMode === 'manual' && manualFontSize <= MIN_FONT_SIZE}
                      aria-label={`Diminuir fonte (atual ${activeFontSize}%)`}
                      className={`pill-btn h-11 min-w-11 w-11 text-xs font-mono ${
                        fitMode === 'manual' && manualFontSize <= MIN_FONT_SIZE ? 'opacity-40' : ''
                      }`}
                    >
                      A-
                    </button>
                    <span className="font-mono text-xs font-semibold tabular-nums text-[var(--ink)] px-1">
                      {activeFontSize}%
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleAdjustFont(10, e)}
                      aria-disabled={fitMode === 'manual' && manualFontSize >= MAX_FONT_SIZE}
                      aria-label={`Aumentar fonte (atual ${activeFontSize}%)`}
                      className={`pill-btn h-11 min-w-11 w-11 text-xs font-mono ${
                        fitMode === 'manual' && manualFontSize >= MAX_FONT_SIZE ? 'opacity-40' : ''
                      }`}
                    >
                      A+
                    </button>
                  </div>
                )}
              </div>

              {/* Tablets & Desktop (>= 640px): inline Auto (pinned left of A-) + A- / A+ */}
              <div className="hidden sm:inline-flex gm3-btn-group flex-shrink-0">
                {fitMode === 'manual' && (
                  <button
                    type="button"
                    data-autofit-reset="true"
                    onClick={handleResetAutoFit}
                    aria-label="Auto: ajuste automático de tela"
                    title="Auto: ajustar fonte automaticamente à tela"
                    className="pill-btn pill-btn-tonal h-11 min-w-11 px-2.5 text-xs font-semibold"
                  >
                    Auto
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => handleAdjustFont(-10, e)}
                  aria-disabled={fitMode === 'manual' && manualFontSize <= MIN_FONT_SIZE}
                  aria-label={`Diminuir fonte (atual ${activeFontSize}%)`}
                  title={`Diminuir fonte (${activeFontSize}%)`}
                  className={`pill-btn h-11 min-w-11 w-11 text-xs font-mono ${
                    fitMode === 'manual' && manualFontSize <= MIN_FONT_SIZE ? 'opacity-40' : ''
                  }`}
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={(e) => handleAdjustFont(10, e)}
                  aria-disabled={fitMode === 'manual' && manualFontSize >= MAX_FONT_SIZE}
                  aria-label={`Aumentar fonte (atual ${activeFontSize}%)`}
                  title={`Aumentar fonte (${activeFontSize}%)`}
                  className={`pill-btn h-11 min-w-11 w-11 text-xs font-mono ${
                    fitMode === 'manual' && manualFontSize >= MAX_FONT_SIZE ? 'opacity-40' : ''
                  }`}
                >
                  A+
                </button>
              </div>

              <button
                ref={annotateToggleRef}
                type="button"
                data-annotate-toggle="true"
                onClick={handleToggleAnnotate}
                aria-pressed={annotateMode}
                aria-label={
                  totalAnnotationCount > 0
                    ? `Anotar nos slides (${totalAnnotationCount} anotações)`
                    : 'Anotar nos slides'
                }
                title={annotateMode ? 'Sair das anotações (Esc)' : 'Anotar à mão ou com texto'}
                className={`relative pill-btn h-11 min-w-11 w-11 lg:w-auto lg:px-3 text-xs flex-shrink-0 ${
                  annotateMode
                    ? 'bg-[var(--warn-dim)] text-[var(--warn-ink)] font-semibold'
                    : ''
                }`}
              >
                <EditIcon size={15} />
                <span className="hidden lg:inline">Anotar</span>
                {totalAnnotationCount > 0 && (
                  <span
                    data-annotate-count="true"
                    className="absolute -top-1 -right-1 lg:static inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-xs font-mono font-semibold tabular-nums leading-none"
                    style={{
                      backgroundColor: annotateMode ? 'var(--surface)' : 'var(--warn-dim)',
                      color: 'var(--warn-ink)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    {totalAnnotationCount}
                  </span>
                )}
              </button>

              {canUseTwoCols && (
                <button
                  type="button"
                  onClick={handleToggleCols}
                  aria-pressed={effectiveCols === 2}
                  aria-label="2 colunas"
                  title={effectiveCols === 2 ? '2 colunas (toque para 1 coluna)' : '1 coluna (toque para 2 colunas)'}
                  className={`pill-btn h-11 min-w-11 w-11 xl:w-auto xl:px-3 text-xs flex-shrink-0 ${
                    effectiveCols === 2 ? 'pill-btn-tonal font-semibold' : ''
                  }`}
                >
                  <ColumnsIcon size={15} />
                  <span className="hidden xl:inline">2 col</span>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  blurOnPointer(e);
                  const next = isDark ? 'light' : 'dark';
                  setTheme(next);
                  announce(next === 'dark' ? 'Tema escuro' : 'Tema claro');
                }}
                aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
                title={isDark ? 'Tema claro' : 'Tema escuro'}
                className="pill-btn h-11 min-w-11 w-11 flex-shrink-0"
              >
                {isDark ? <SunIcon size={17} /> : <MoonIcon size={17} />}
              </button>
            </div>
          </div>
        </header>

        {/* Optional compact stage cue bar (constant single-line height across pages) */}
        {rawSong.notes && (
          <div className="flex-shrink-0 px-2.5 sm:px-3.5 pt-0.5">
            <div
              title={rawSong.notes}
              className="rounded-2xl bg-[var(--warn-dim)] text-[var(--warn-ink)] px-3 py-1 text-xs font-medium truncate"
            >
              {rawSong.notes}
            </div>
          </div>
        )}

        {/* Full-bleed Slide Stage utilizing 100% of available viewport width and height */}
        <main
          id="main-content"
          tabIndex={-1}
          data-slides-stage="true"
          onClick={handleStageClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={(e) => finishStagePointer(e, false)}
          onPointerCancel={(e) => finishStagePointer(e, true)}
          className={`relative flex-1 min-h-0 overflow-hidden px-2.5 sm:px-3.5 py-1.5 focus:outline-none ${stageCursorClass}`}
          style={{ touchAction: annotateMode ? 'none' : 'manipulation' }}
        >
          {/* Subtle peripheral edge pulse when turning pages */}
          {edgeFlash && (
            <div
              key={edgeFlash.seq}
              aria-hidden="true"
              onAnimationEnd={() => setEdgeFlash(null)}
              className={`gm3-edge-pulse pointer-events-none absolute inset-y-2 w-12 z-20 rounded-2xl ${
                edgeFlash.side === 'left'
                  ? 'left-1 bg-gradient-to-r from-[var(--accent)]/25 to-transparent'
                  : 'right-1 bg-gradient-to-l from-[var(--accent)]/25 to-transparent'
              }`}
            />
          )}

          {/* Brief non-blocking song boundary cue pill */}
          {songBanner && (
            <div
              key={songBanner.seq}
              aria-hidden="true"
              onAnimationEnd={() => setSongBanner(null)}
              className="gm3-song-toast pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100%-32px)] rounded-full bg-[var(--ink)] text-[var(--surface)] px-4 py-1.5 text-xs font-display font-semibold truncate"
              style={{ boxShadow: 'var(--shadow-sm)' }}
            >
              {songBanner.text}
            </div>
          )}

          {/* Visible GM3 Undo Snackbar (elevated z-50 above the 56px dock on all viewports) */}
          {undoSnackbar && undoSnackbar.songId === rawSong.id && canUndoAnnotations && (
            <div
              key={undoSnackbar.seq}
              data-undo-snackbar="true"
              role="status"
              className="gm3-undo-snackbar fixed bottom-[64px] left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 pl-4 pr-1.5 py-1 text-xs font-medium"
              style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span>{undoSnackbar.message}</span>
              <button
                type="button"
                onClick={(e) => {
                  blurOnPointer(e);
                  if (undoAnnotations(rawSong.id)) {
                    setUndoSnackbar(null);
                    announce('Anotação desfeita');
                  }
                }}
                className="rounded-full px-3.5 h-11 min-w-11 text-xs font-semibold bg-[var(--primary-container)] text-[var(--on-primary-container)] cursor-pointer"
              >
                Desfazer
              </button>
            </div>
          )}

          <div ref={stageInnerRef} className="relative w-full h-full overflow-visible">
            {/* Hidden exact-width DOM measurement mirror driving Auto-Fit + zero-overflow pagination */}
            {measureColWidth > 0 && (
              <div
                ref={measureRef}
                aria-hidden="true"
                inert
                className="pointer-events-none invisible absolute top-0 left-0 -z-10"
                style={
                  {
                    width: `${measureColWidth}px`,
                    fontSize: `${mirrorFontSize}%`,
                  } as CSSProperties
                }
              >
                {preparedSections.map((sec) => {
                  const colors = SECTION_COLORS[sec.type] || SECTION_COLORS.verse;
                  const isLyricsOnly = displayMode === 'lyrics-only';
                  const isChorus = sec.type === 'chorus';
                  if (sec.instrumentalOnly) {
                    return (
                      <section
                        key={sec.sectionIdx}
                        data-measure-section={sec.sectionIdx}
                        className="rounded-[22px] px-4 py-2 flex items-center gap-2"
                      >
                        <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 whitespace-nowrap">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" />
                          <span className="font-display text-[clamp(13px,0.78em,18px)] font-semibold">
                            {sec.label}
                          </span>
                        </div>
                        <span className="text-xs">· trecho instrumental</span>
                      </section>
                    );
                  }
                  return (
                    <section
                      key={sec.sectionIdx}
                      data-measure-section={sec.sectionIdx}
                      className={`rounded-[22px] ${
                        isLyricsOnly ? 'px-4 sm:px-5 xl:px-6 py-3 xl:py-3.5' : 'px-4 sm:px-5 xl:px-6 py-2.5 xl:py-3.5'
                      }`}
                      style={{ background: colors.bg }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 whitespace-nowrap">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" />
                          <span className="font-display text-[clamp(13px,0.78em,18px)] font-semibold leading-tight">
                            {sec.label}
                          </span>
                        </div>
                      </div>
                      <div
                        data-measure-lines="true"
                        className={isLyricsOnly ? 'space-y-1.5' : 'space-y-0.5'}
                      >
                        {sec.lines.map((line, lineIdx) => (
                          <div key={lineIdx} data-measure-line={lineIdx}>
                            <ChordLine
                              line={line}
                              onChordTap={noopChordTap}
                              displayMode={displayMode}
                              interactiveChords={false}
                              inChorus={isChorus}
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}

            {/* Visible Full-Screen Paginated Slide */}
            <div
              ref={swipeLayerRef}
              className="relative w-full h-full flex items-stretch"
            >
              {isLayoutSynced && (
                <div
                  key={`${rawSong.id}-${safePageIdx}-${turnAnim.seq}`}
                  data-slide-page={safePageIdx + 1}
                  data-slide-total={totalPages}
                  className={`${slideAnimClass} relative isolate w-full h-full ${
                    effectiveCols === 2 && !singleSpread
                      ? 'grid grid-cols-2 gap-3 xl:gap-4 items-stretch'
                      : 'flex items-stretch'
                  }`}
                  style={{ fontSize: `${activeFontSize}%` }}
                >
                  {/* Stage-level open-canvas highlighters behind cards */}
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
                          className={`relative z-[1] h-full overflow-visible flex flex-col min-w-0 w-full ${
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
                              strokesByAnchor={strokesByAnchor}
                              notesByAnchor={notesByAnchor}
                              annotateMode={annotateMode}
                              activeTool={annotateTool}
                              draggingNoteId={dragNote?.moved ? dragNote.note.id : null}
                              onStartDragNote={handleStartDragNote}
                              onTapNote={handleTapNote}
                            />
                          ))}
                        </div>
                      );
                    })
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm text-[var(--muted)]">
                      {displayMode === 'chords-only'
                        ? 'Esta música não tem acordes marcados.'
                        : 'Nenhum conteúdo para exibir neste modo.'}
                    </div>
                  )}

                  {/* Stage-level open canvas / margin pen ink & notes */}
                  <StrokeLayer strokes={pageStrokes} coordMode="page" renderKind="pen" />
                  <TextNoteList
                    notes={pageNotes}
                    coordMode="page"
                    annotateMode={annotateMode}
                    activeTool={annotateTool}
                    draggingNoteId={dragNote?.moved ? dragNote.note.id : null}
                    onStartDragNote={handleStartDragNote}
                    onTapNote={handleTapNote}
                  />
                </div>
              )}

              {/* Zero-latency 60fps live ink stroke preview */}
              {liveStroke && (
                <LiveStrokePreview
                  points={liveStroke.points}
                  tool={liveStroke.tool}
                  tone={liveStroke.tone}
                  scalePx={Math.max(10, (16 * activeFontSize) / 100)}
                />
              )}
            </div>
          </div>

          {/* Live floating chip while dragging an existing text note (exact pointer grab offset) */}
          {dragNote && dragNote.moved && dragToneMeta && (
            <div
              aria-hidden="true"
              data-dragging="true"
              className="gm3-note-chip pointer-events-none fixed z-50 inline-flex items-start gap-1.5 px-2.5 py-1 w-max max-w-[220px]"
              style={{
                left: dragNote.curX - dragNote.grabDx,
                top: dragNote.curY - dragNote.grabDy,
                backgroundColor: dragToneMeta.chipBg,
                color: dragToneMeta.chipFg,
              }}
            >
              <span className="mt-[4px]">
                <ToneShapeGlyph shape={dragToneMeta.shape} color={dragToneMeta.dotColor} size={8} />
              </span>
              <span className="font-sans font-medium text-[13px] leading-snug break-words whitespace-pre-wrap">
                {dragNote.note.text}
              </span>
            </div>
          )}
        </main>

        {/* Fixed-height bottom bar stays mounted (invisible while annotating) so toggling Annotate Mode causes 0px stage reflow */}
        <footer
          aria-hidden={annotateMode || undefined}
          className={`flex-shrink-0 h-[56px] bg-[var(--bg)] px-2.5 sm:px-3.5 flex items-center justify-between gap-2 ${
            annotateMode ? 'invisible pointer-events-none' : ''
          }`}
        >
          <button
            type="button"
            tabIndex={annotateMode ? -1 : 0}
            onClick={(e) => {
              blurOnPointer(e);
              goPrev();
            }}
            aria-disabled={atDeckStart}
            aria-label={prevAriaLabel}
            className={`pill-btn h-11 min-w-11 px-3 sm:px-4 text-sm font-medium flex-shrink-0 ${
              atDeckStart ? 'opacity-40' : ''
            }`}
          >
            <ChevronLeftIcon size={16} />
            <span className="hidden sm:inline">Anterior</span>
            <span className="sm:hidden">Ant.</span>
          </button>

          <div className="flex items-center justify-center gap-2.5 min-w-0 flex-1">
            {totalPages <= 8 && !(isLastPageOfSong && nextSong) && (
              <div className="hidden sm:flex items-center gap-1.5" aria-hidden="true">
                {Array.from({ length: totalPages }, (_, i) => (
                  <span
                    key={i}
                    className={`gm3-page-dot ${
                      i === safePageIdx ? 'w-5 bg-[var(--accent)]' : 'w-2 bg-[var(--line)]'
                    }`}
                  />
                ))}
              </div>
            )}

            <span
              data-slide-indicator="true"
              className="font-expressive text-sm font-medium text-[var(--ink)] tabular-nums whitespace-nowrap"
            >
              Pág {safePageIdx + 1}/{totalPages}
            </span>

            {isLastPageOfSong && nextSong && (
              <span
                data-next-song-cue="true"
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] text-[var(--muted)] px-3 py-1.5 text-xs font-medium truncate max-w-[180px] sm:max-w-[280px]"
                title={`Próxima música: ${nextSong.title}`}
              >
                <span className="truncate">Próx: {nextSong.title}</span>
                {nextSong.displayKey && (
                  <span className="font-mono font-semibold text-[var(--ink)] flex-shrink-0">
                    · {nextSong.displayKey}
                  </span>
                )}
              </span>
            )}
          </div>

          <button
            type="button"
            tabIndex={annotateMode ? -1 : 0}
            onClick={(e) => {
              blurOnPointer(e);
              goNext();
            }}
            aria-disabled={atDeckEnd}
            aria-label={nextAriaLabel}
            className={`pill-btn pill-btn-tonal h-11 min-w-11 px-3 sm:px-4 text-sm font-medium flex-shrink-0 ${
              atDeckEnd ? 'opacity-40' : ''
            }`}
          >
            <span className="hidden sm:inline">
              {isLastPageOfSong && nextSong ? 'Próxima música' : 'Próxima'}
            </span>
            <span className="sm:hidden">Próx.</span>
            <ChevronRightIcon size={16} />
          </button>
        </footer>

        {/* True floating GM3 Annotation Dock overlay (0px layout impact on the slide stage!) */}
        {annotateMode && (
          <SlideAnnotationDock
            tool={annotateTool}
            tone={annotateTone}
            canUndo={canUndoAnnotations}
            canRedo={canRedoAnnotations}
            hasAnyAnnotations={totalAnnotationCount > 0}
            annotationCount={totalAnnotationCount}
            atDeckStart={atDeckStart}
            atDeckEnd={atDeckEnd}
            pageLabel={`Pág ${safePageIdx + 1}/${totalPages}`}
            onSelectTool={(t, fromKeyboard) => {
              if (t === 'text' && (fromKeyboard || annotateTool === 'text')) {
                setAnnotateTool('text');
                openKeyboardNewNote();
                return;
              }
              setAnnotateTool(t);
              const names: Record<AnnotateTool, string> = {
                pen: 'Caneta',
                highlighter: 'Marcador',
                text: 'Nota de texto',
                eraser: 'Borracha',
              };
              announce(`Ferramenta ${names[t]}`);
            }}
            onSelectTone={(nextTone) => {
              setAnnotateTone(nextTone);
              announce(`Cor ${NOTE_TONE_MAP[nextTone].label}`);
            }}
            onUndo={() => {
              if (undoAnnotations(rawSong.id)) {
                setUndoSnackbar(null);
                announce('Anotação desfeita');
              }
            }}
            onRedo={() => {
              if (redoAnnotations(rawSong.id)) {
                announce('Anotação refeita');
              }
            }}
            onClearAll={() => {
              clearSongAnnotations(rawSong.id);
              showUndoToast(rawSong.id, 'Anotações limpas', 5000);
              announce('Anotações desta música limpas. Toque em Desfazer para recuperar.');
            }}
            onDone={() => {
              cancelActiveGestures();
              setAnnotateMode(false);
              void flushPendingSync(rawSong.id);
              announce('Anotações salvas');
              requestAnimationFrame(() => annotateToggleRef.current?.focus());
            }}
            onPrev={goPrev}
            onNext={goNext}
          />
        )}
      </div>

      {/* Inline GM3 Text Note Composer (anchored at tap spot, viewport-clamped, focus-trapped) */}
      {noteComposer && (
        <SlideNoteComposer
          initialText={noteComposer.initialText}
          initialTone={noteComposer.initialTone}
          initialSectionIdx={
            noteComposer.anchor.kind === 'section' ? noteComposer.anchor.sectionIdx : null
          }
          sectionOptions={visibleSectionOptions}
          isEditing={noteComposer.mode === 'edit'}
          anchorPoint={noteComposer.anchorPoint}
          onSave={(text, tone, movedSectionIdx) => {
            const finalAnchor: AnnotationAnchor =
              movedSectionIdx !== undefined && movedSectionIdx !== null
                ? { kind: 'section', sectionIdx: movedSectionIdx, origLineIdx: -1 }
                : noteComposer.anchor;
            const finalX =
              movedSectionIdx !== undefined && movedSectionIdx !== null ? 1 : noteComposer.x;
            const finalY =
              movedSectionIdx !== undefined && movedSectionIdx !== null ? 0.6 : noteComposer.y;
            const finalAlign: 'left' | 'right' =
              movedSectionIdx !== undefined && movedSectionIdx !== null
                ? 'right'
                : noteComposer.align;

            if (noteComposer.mode === 'edit' && noteComposer.noteId) {
              updateTextNote(rawSong.id, noteComposer.noteId, {
                text,
                tone,
                anchor: finalAnchor,
                x: finalX,
                y: finalY,
                align: finalAlign,
              });
              announce('Nota atualizada');
            } else {
              addTextNote(rawSong.id, {
                id: makeId('note'),
                text,
                tone,
                anchor: finalAnchor,
                x: finalX,
                y: finalY,
                align: finalAlign,
                createdAt: Date.now(),
              });
              announce('Nota adicionada');
            }
            setAnnotateTone(tone);
            setNoteComposer(null);
          }}
          onDelete={
            noteComposer.mode === 'edit' && noteComposer.noteId
              ? () => {
                  removeTextNote(rawSong.id, noteComposer.noteId!);
                  setNoteComposer(null);
                  announce('Nota excluída');
                }
              : undefined
          }
          onCancel={() => setNoteComposer(null)}
        />
      )}

      {activeSetlist && (
        <SetlistDrawer
          open={showSetlistDrawer}
          setlist={activeSetlist}
          currentSongId={rawSong.id}
          canReorder
          onNavigate={jumpToSongById}
          onClose={() => setShowSetlistDrawer(false)}
        />
      )}
    </div>
  );
}
