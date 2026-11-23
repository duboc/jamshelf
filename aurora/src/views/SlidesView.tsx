import { useEffect, useMemo, useRef, useState } from 'react';
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
  type NoteTone,
} from '@/lib/types/annotations';
import {
  computeSlideFillStats,
  packSectionsIntoSlides,
  prepareSlideSections,
  type SlideSectionMetrics,
} from '@/lib/utils/slide-pagination';
import { parseLine, transposeChord } from '@/lib/utils/music';
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

const AUTO_FIT_SCALES = [1.32, 1.22, 1.12, 1.04, 0.96, 0.88, 0.8, 0.74];

const TONE_LABELS_PT: Record<NoteTone, string> = {
  amber: 'Âmbar',
  primary: 'Azul',
  tune: 'Verde',
  rec: 'Vermelho',
};

export function SlidesView() {
  const route = useRoute();
  const setlistId = route.params.get('setlist');
  const initialSongId = route.params.get('song');

  const entries = useSongStore((s) => s.entries);
  const songsLoaded = useSongStore((s) => s.isLoaded);
  const getSong = useSongStore((s) => s.getSong);
  const setlists = useSetlistStore((s) => s.setlists);
  const { displayMode, setDisplayMode, capoDisplay, setCapoDisplay } = useDisplayStore();
  const useFlats = usePlayerStore((s) => s.useFlats);

  const {
    bySong: annotationsBySong,
    historyBySong,
    fetchSongAnnotations,
    addStroke,
    removeStroke,
    addTextNote,
    removeTextNote,
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

  const initialIdx = useMemo(() => {
    if (!initialSongId) return 0;
    const found = deckSongs.findIndex((s) => s.id === initialSongId);
    return found >= 0 ? found : 0;
  }, [deckSongs, initialSongId]);

  const [songIdx, setSongIdx] = useState(initialIdx);
  const [slideIdx, setSlideIdx] = useState(0);
  const [turnDir, setTurnDir] = useState<'next' | 'prev' | 'none'>('none');
  const [transpose, setTranspose] = useState(0);
  const [autoFit, setAutoFit] = useState(true);
  const [manualScale, setManualScale] = useState(1.0);
  const [columns, setColumns] = useState<1 | 2>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 960 ? 2 : 1
  );
  const [deckOpen, setDeckOpen] = useState(false);
  const [slideControlsOpen, setSlideControlsOpen] = useState(false);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [activeTool, setActiveTool] = useState<AnnotateTool>('pen');
  const [activeTone, setActiveTone] = useState<NoteTone>('amber');
  const [noteComposer, setNoteComposer] = useState<{ x: number; y: number } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 820,
  }));
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  const annotateModeRef = useRef(annotateMode);
  annotateModeRef.current = annotateMode;

  const stageRef = useRef<HTMLDivElement>(null);
  const stageInnerRef = useRef<HTMLDivElement>(null);
  const annotateToolbarRef = useRef<HTMLDivElement>(null);
  const wasAnnotatingRef = useRef(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const drawingRef = useRef<{
    pts: Array<{ x: number; y: number; pressure: number }>;
    originX: number;
    originY: number;
  } | null>(null);
  const [liveStrokeD, setLiveStrokeD] = useState<string>('');

  const currentSong = deckSongs[songIdx] ?? null;
  const rawTotalShift =
    currentSong && capoDisplay === 'shapes' ? transpose - currentSong.capo : transpose;
  const currentSongId = currentSong?.id ?? '';
  const [shiftTracker, setShiftTracker] = useState<{
    songId: string;
    shift: number;
    dir: 'none' | 'up' | 'down' | 'reset';
  }>({ songId: currentSongId, shift: rawTotalShift, dir: 'none' });
  if (shiftTracker.songId !== currentSongId) {
    setShiftTracker({ songId: currentSongId, shift: rawTotalShift, dir: 'none' });
  } else if (shiftTracker.shift !== rawTotalShift) {
    const dir =
      rawTotalShift === 0 && shiftTracker.shift !== 0
        ? 'reset'
        : rawTotalShift > shiftTracker.shift
          ? 'up'
          : 'down';
    setShiftTracker({ songId: currentSongId, shift: rawTotalShift, dir });
  }

  useEffect(() => {
    if (annotateMode && !wasAnnotatingRef.current) {
      const firstControl = annotateToolbarRef.current?.querySelector<HTMLElement>(
        'button:not(:disabled)'
      );
      firstControl?.focus({ preventScroll: true });
    } else if (!annotateMode && wasAnnotatingRef.current) {
      const visibleTrigger = [
        ...document.querySelectorAll<HTMLElement>('[data-slides-annotate-trigger]'),
      ].find((el) => el.offsetParent !== null);
      visibleTrigger?.focus({ preventScroll: true });
    }
    wasAnnotatingRef.current = annotateMode;
  }, [annotateMode]);

  useEffect(() => {
    setSongIdx(initialIdx);
    setSlideIdx(0);
    setTurnDir('none');
  }, [initialIdx]);

  useEffect(() => {
    if (currentSong?.id) {
      void fetchSongAnnotations(currentSong.id);
      const info = getDisplayTitleAndArtist(currentSong);
      document.title = `Slides: ${info.title} - Jamshelf`;
    }
  }, [currentSong?.id, fetchSongAnnotations]);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = Math.floor(el.clientWidth / 4) * 4;
      const h = Math.floor(el.clientHeight / 4) * 4;
      if (w < 100 || h < 100) return;
      // Preserve zero pagination reflow while annotating at stable width; still adapt on real viewport/orientation resize
      setStageSize((prev) => {
        if (annotateModeRef.current && prev && Math.abs(prev.w - w) <= 8) return prev;
        return prev && prev.w === w && prev.h === h ? prev : { w, h };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [currentSong?.id]);

  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null;
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    wl?.request('screen')
      .then((s) => {
        sentinel = s;
      })
      .catch(() => {});
    return () => {
      void sentinel?.release();
    };
  }, []);

  // Auto-Fit solver using measured stage dimensions so 390px/768px/1024px/1440px never clip lyrics
  const { slides, activeScale } = useMemo(() => {
    if (!currentSong) return { slides: [], activeScale: 1 };
    const prepared = prepareSlideSections(currentSong.sections, displayMode);
    const padY = viewport.w >= 640 ? 48 : 36;
    const padX = viewport.w >= 640 ? 48 : 32;
    const budget = stageSize
      ? Math.max(180, stageSize.h - padY - 12)
      : Math.max(220, viewport.h - 200);
    const usableW = stageSize
      ? Math.max(260, stageSize.w - padX)
      : Math.max(280, viewport.w - padX);
    const effectiveCols: 1 | 2 = columns === 2 && viewport.w >= 1024 ? 2 : 1;
    const colWidthPx =
      effectiveCols === 2 ? (usableW - 16) / 2 - 44 : Math.min(896, usableW) - 44;

    const buildForScale = (scale: number) => {
      const colChars = Math.max(20, Math.floor(colWidthPx / (9.4 * scale)));
      const chordPad = displayMode === 'both' ? 20 : 6;
      const lineBodyH = displayMode === 'both' ? 26 * scale : 28 * scale;
      const chromeH = 76;
      const metrics: SlideSectionMetrics[] = prepared.map((sec) => {
        const lineHeights = sec.lines.map((l) => {
          if (!l.trim()) return 12 * scale;
          const plainLen = l.replace(/\[[^\]]*\]/g, '').length;
          const wrapped = Math.max(1, Math.ceil(plainLen / colChars));
          return chordPad + lineBodyH * wrapped + 10;
        });
        return {
          fullHeight: chromeH + lineHeights.reduce((a, b) => a + b, 0),
          chromeHeight: chromeH,
          lineHeights,
        };
      });
      return packSectionsIntoSlides(prepared, metrics, budget, effectiveCols, 16);
    };

    if (!autoFit) {
      return { slides: buildForScale(manualScale), activeScale: manualScale };
    }

    const baseSlides = buildForScale(0.96);
    const basePages = baseSlides.length;
    let bestSlides = baseSlides;
    let bestScale = 0.96;

    for (const sc of AUTO_FIT_SCALES) {
      const candidate = buildForScale(sc);
      const stats = computeSlideFillStats(candidate, budget);
      if (candidate.length <= basePages && stats.maxColFill <= 0.92) {
        bestSlides = candidate;
        bestScale = sc;
        break;
      }
    }
    return { slides: bestSlides, activeScale: bestScale };
  }, [currentSong, displayMode, viewport.w, viewport.h, stageSize, columns, autoFit, manualScale]);

  const safeSlideIdx = Math.min(slideIdx, Math.max(0, slides.length - 1));

  const goNext = () => {
    if (safeSlideIdx < slides.length - 1) {
      setTurnDir('next');
      setSlideIdx(safeSlideIdx + 1);
    } else if (songIdx < deckSongs.length - 1) {
      setTurnDir('next');
      setSongIdx(songIdx + 1);
      setSlideIdx(0);
      setTranspose(0);
    }
  };

  const goPrev = () => {
    if (safeSlideIdx > 0) {
      setTurnDir('prev');
      setSlideIdx(safeSlideIdx - 1);
    } else if (songIdx > 0) {
      setTurnDir('prev');
      setSongIdx(songIdx - 1);
      setSlideIdx(0);
      setTranspose(0);
    }
  };

  const handleExit = () => {
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
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (deckOpen || noteComposer || confirmClearOpen) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const onInteractive = Boolean(target?.closest('button, a, [role="button"], summary'));
      const inChrome = Boolean(target?.closest('header, footer, [role="toolbar"]'));

      if (e.key === 'PageDown' || ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && !inChrome)) {
        e.preventDefault();
        goNext();
      } else if (e.key === ' ' && !e.shiftKey) {
        if (onInteractive) return;
        e.preventDefault();
        goNext();
      } else if (e.key === 'PageUp' || ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && !inChrome)) {
        e.preventDefault();
        goPrev();
      } else if (e.key === ' ' && e.shiftKey) {
        if (onInteractive) return;
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        if (annotateMode) setAnnotateMode(false);
        else handleExit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!currentSong) {
    return (
      <main id="main" tabIndex={-1} className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center">
        <h1 className="typescale-headline-sm text-on-surface m-0">
          {!songsLoaded ? 'Carregando slides...' : 'Nenhuma música para apresentar'}
        </h1>
        <AuroraButton color="filled" icon="arrow_back" onClick={handleExit}>
          Voltar
        </AuroraButton>
      </main>
    );
  }

  const page = slides[safeSlideIdx];
  const { title: displayTitle, artist: displayArtist } = getDisplayTitleAndArtist(currentSong);
  const effKey = getEffectiveKey(currentSong);
  const totalShift =
    capoDisplay === 'shapes' ? transpose - currentSong.capo : transpose;
  const displayedKey = effKey.key
    ? transposeChord(effKey.key, transpose, useFlats)
    : '';

  const songAnnotations = annotationsBySong[currentSong.id] ?? {
    songId: currentSong.id,
    strokes: [],
    notes: [],
    updatedAt: 0,
  };
  const songHist = historyBySong[currentSong.id];
  const canUndo = (songHist?.past.length ?? 0) > 0;
  const canRedo = (songHist?.future.length ?? 0) > 0;
  const hasAnyAnnotations = songAnnotations.strokes.length > 0 || songAnnotations.notes.length > 0;

  const pageStrokes = songAnnotations.strokes.filter(
    (st) => st.anchor.kind === 'page' && st.anchor.pageIdx === safeSlideIdx
  );
  const pageNotes = songAnnotations.notes.filter(
    (n) => n.anchor.kind === 'page' && n.anchor.pageIdx === safeSlideIdx
  );

  // Pointer handlers for touch swipe (performance mode) OR pen/highlighter/text note (annotate mode)
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const rect = (stageInnerRef.current ?? stageRef.current)?.getBoundingClientRect();
    if (!rect) return;

    if (!annotateMode) {
      swipeStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (activeTool === 'text') {
      const x = Math.max(0.05, Math.min(0.92, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0.08, Math.min(0.92, (e.clientY - rect.top) / rect.height));
      setNoteComposer({ x, y });
      setNoteText('');
      return;
    }

    if (activeTool === 'pen' || activeTool === 'highlighter') {
      e.currentTarget.setPointerCapture(e.pointerId);
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      drawingRef.current = {
        originX: x / rect.width,
        originY: y / rect.height,
        pts: [{ x: 0, y: 0, pressure: e.pressure || 0.5 }],
      };
      setLiveStrokeD(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!annotateMode) {
      const start = swipeStartRef.current;
      const inner = stageInnerRef.current;
      if (!start || !inner) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        const clamped = Math.max(-36, Math.min(36, dx * 0.22));
        inner.style.transition = 'none';
        inner.style.transform = `translate3d(${clamped.toFixed(1)}px, 0, 0)`;
      }
      return;
    }
    if (!drawingRef.current) return;
    const rect = (stageInnerRef.current ?? stageRef.current)?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ox = drawingRef.current.originX * rect.width;
    const oy = drawingRef.current.originY * rect.height;
    drawingRef.current.pts.push({ x: x - ox, y: y - oy, pressure: e.pressure || 0.5 });
    const absPts: [number, number, number][] = drawingRef.current.pts.map((p) => [
      ox + p.x,
      oy + p.y,
      p.pressure,
    ]);
    setLiveStrokeD(buildSmoothSvgPath(absPts));
  };

  const resetSwipeTransform = () => {
    const inner = stageInnerRef.current;
    if (inner) {
      inner.style.transition = '';
      inner.style.transform = '';
    }
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!annotateMode) {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      resetSwipeTransform();
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        if (dx < 0) goNext();
        else goPrev();
        return;
      }
      // Tap left/right edges to turn slides on iPad/phone (outside interactive controls)
      const target = e.target as HTMLElement | null;
      if (
        Math.hypot(dx, dy) < 12 &&
        !target?.closest('button, a, input, textarea, [role="button"]')
      ) {
        const rect = stageRef.current?.getBoundingClientRect();
        if (rect && rect.width > 0) {
          const relX = (e.clientX - rect.left) / rect.width;
          if (relX <= 0.24) goPrev();
          else if (relX >= 0.72) goNext();
        }
      }
      return;
    }

    if (!drawingRef.current) return;
    const draft = drawingRef.current;
    drawingRef.current = null;
    setLiveStrokeD('');

    if (draft.pts.length < 2) return;
    const simplified = simplifyRawPoints(draft.pts, 2.4);
    const pxPerEm = 16;
    const points: [number, number, number][] = simplified.map((p) => [
      Math.round((p.x / pxPerEm) * 1000) / 1000,
      Math.round((p.y / pxPerEm) * 1000) / 1000,
      Math.round(p.pressure * 100) / 100,
    ]);

    addStroke(currentSong.id, {
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: activeTool === 'highlighter' ? 'highlighter' : 'pen',
      tone: activeTone,
      anchor: { kind: 'page', pageIdx: safeSlideIdx },
      originX: Math.round(draft.originX * 1000) / 1000,
      originY: Math.round(draft.originY * 1000) / 1000,
      points,
      createdAt: Date.now(),
    });
  };

  const commitTextNote = (textValue: string) => {
    if (!noteComposer || !textValue.trim()) return;
    addTextNote(currentSong.id, {
      id: `nt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: textValue.trim(),
      tone: activeTone,
      anchor: { kind: 'page', pageIdx: safeSlideIdx },
      x: Math.round(noteComposer.x * 1000) / 1000,
      y: Math.round(noteComposer.y * 1000) / 1000,
      align: noteComposer.x > 0.65 ? 'right' : 'left',
      createdAt: Date.now(),
    });
    setNoteComposer(null);
    setNoteText('');
  };

  const transposePillLabel = displayedKey
    ? transpose === 0
      ? displayedKey
      : `${displayedKey} (${transpose > 0 ? `+${transpose}` : transpose})`
    : transpose > 0
      ? `+${transpose}`
      : `${transpose}`;

  return (
    <main
      id="main"
      tabIndex={-1}
      data-motion-scheme="standard"
      className="fixed inset-0 bg-canvas text-on-surface flex flex-col focus:outline-none"
    >
      <div role="status" aria-live="polite" className="sr-only">
        {displayTitle}, slide {safeSlideIdx + 1} de {slides.length}
        {annotateMode ? ', modo anotação ativo' : ''}
      </div>
      {/* Top tonal stage bar (slim 1-row on mobile < md, full inline on md+) */}
      <header className="px-3 sm:px-6 py-2 bg-surface-container-low flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1 md:flex-initial">
          <AuroraIconButton
            icon="close"
            label="Sair dos slides"
            variant="outlined"
            className="md:hidden"
            onClick={handleExit}
          />
          <AuroraButton
            color="outlined"
            icon="close"
            className="hidden md:inline-flex lg:px-3"
            onClick={handleExit}
          >
            Sair
          </AuroraButton>
          <div className="min-w-0">
            <h1 className="typescale-title-md text-on-surface m-0 truncate">
              {displayTitle}
              {displayedKey ? ` · ${displayedKey}` : ''}
            </h1>
            <div className="typescale-body-sm text-on-surface-variant truncate">
              {displayArtist || 'Sem artista'} · Slide {safeSlideIdx + 1} de {slides.length}
              {deckSongs.length > 1 ? ` · Música ${songIdx + 1} de ${deckSongs.length}` : ''}
              {autoFit && (
                <span className="hidden sm:inline">
                  {` · Autoajuste ${Math.round(activeScale * 100)}%`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Mobile compact actions (< md) so header stays 1 slim row */}
        <div className="flex md:hidden items-center gap-1 flex-shrink-0">
          <AuroraIconButton
            data-slides-annotate-trigger="true"
            icon="draw"
            label="Anotar no slide"
            variant={annotateMode ? 'tonal' : 'outlined'}
            aria-pressed={annotateMode}
            aria-controls={annotateMode ? 'slides-annotate-toolbar' : undefined}
            onClick={() => setAnnotateMode((v) => !v)}
          />
          {deckSongs.length > 1 && (
            <AuroraIconButton
              icon="queue_music"
              label={`Lista de músicas (${deckSongs.length})`}
              variant="tonal"
              onClick={() => setDeckOpen(true)}
            />
          )}
          <AuroraIconButton
            icon="tune"
            label="Ajustes dos slides"
            variant="outlined"
            onClick={() => setSlideControlsOpen(true)}
          />
        </div>

        {/* Tablet & desktop inline controls (md+) */}
        <div className="hidden md:flex items-center gap-1.5 flex-wrap">
          <div className="inline-flex items-center rounded-full bg-surface-container-high px-0.5">
            <button
              type="button"
              aria-label="Descer meio tom"
              title="Descer meio tom"
              onClick={() => setTranspose((v) => v - 1)}
              className="dock-stepper-btn"
            >
              <UiIcon name="remove" size={20} />
            </button>
            <button
              type="button"
              onClick={() => setTranspose(0)}
              aria-label={`Tom atual ${transposePillLabel}. Ativar para restaurar tom original`}
              title="Restaurar tom original"
              className="transpose-reset-btn typescale-label-sm font-mono tabular-nums"
            >
              <span
                key={shiftTracker.dir === 'none' ? 'init' : String(totalShift)}
                data-shift-dir={shiftTracker.dir === 'none' ? undefined : shiftTracker.dir}
                className="chord-settle"
              >
                {transposePillLabel}
              </span>
            </button>
            <button
              type="button"
              aria-label="Subir meio tom"
              title="Subir meio tom"
              onClick={() => setTranspose((v) => v + 1)}
              className="dock-stepper-btn"
            >
              <UiIcon name="add" size={20} />
            </button>
          </div>

          {currentSong.capo > 0 && (
            <AuroraChip
              selected={capoDisplay === 'shapes'}
              onClick={() => setCapoDisplay(capoDisplay === 'shapes' ? 'sounding' : 'shapes')}
            >
              {capoDisplay === 'shapes' ? `Formas (Capo ${currentSong.capo})` : 'Som real'}
            </AuroraChip>
          )}

          <AuroraChip
            selected={autoFit}
            icon="fit_screen"
            onClick={() => setAutoFit((v) => !v)}
            className="min-h-[44px]"
          >
            <span className="hidden xl:inline">Autoajuste</span>
            <span className="xl:hidden">Ajuste</span>
          </AuroraChip>

          {!autoFit && (
            <div className="inline-flex items-center rounded-full bg-surface-container-high px-1">
              <AuroraIconButton
                icon="text_decrease"
                label="Diminuir zoom dos slides"
                onClick={() => setManualScale((s) => Math.max(0.75, Number((s - 0.1).toFixed(2))))}
              />
              <span className="typescale-body-sm font-mono tabular-nums">
                {Math.round(manualScale * 100)}%
              </span>
              <AuroraIconButton
                icon="text_increase"
                label="Aumentar zoom dos slides"
                onClick={() => setManualScale((s) => Math.min(1.45, Number((s + 0.1).toFixed(2))))}
              />
            </div>
          )}

          <span className="w-px h-5 bg-outline-variant/60 mx-0.5" aria-hidden="true" />

          <AuroraSegmented<DisplayMode>
            ariaLabel="Modo dos slides"
            value={displayMode}
            onChange={setDisplayMode}
            options={[
              { value: 'both', label: 'Cifra' },
              { value: 'lyrics-only', label: 'Letra' },
              { value: 'chords-only', label: 'Acordes' },
            ]}
          />

          <AuroraButton
            id="slides-annotate-btn"
            data-slides-annotate-trigger="true"
            color={annotateMode ? 'tonal' : 'outlined'}
            icon="draw"
            aria-pressed={annotateMode}
            aria-controls={annotateMode ? 'slides-annotate-toolbar' : undefined}
            className="lg:px-3"
            onClick={() => setAnnotateMode((v) => !v)}
          >
            Anotar
          </AuroraButton>

          <AuroraIconButton
            icon="view_column_2"
            label="Layout em 2 colunas"
            variant={columns === 2 ? 'tonal' : 'standard'}
            aria-pressed={columns === 2}
            onClick={() => setColumns(columns === 2 ? 1 : 2)}
            className="hidden lg:inline-flex"
          />

          {deckSongs.length > 1 && (
            <AuroraButton color="tonal" icon="queue_music" onClick={() => setDeckOpen(true)}>
              Lista ({deckSongs.length})
            </AuroraButton>
          )}
        </div>
      </header>

      {/* Slide canvas + annotations layer (0px occlusion and constant height budget!) */}
      <div
        ref={stageRef}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={() => {
          swipeStartRef.current = null;
          drawingRef.current = null;
          setLiveStrokeD('');
          resetSwipeTransform();
        }}
        className={`relative flex-1 overflow-hidden p-4 sm:p-6 transition-shadow ${
          annotateMode ? 'touch-none cursor-crosshair ring-2 ring-inset ring-primary/75' : ''
        }`}
      >
        <div
          ref={stageInnerRef}
          key={`${currentSong.id}-${safeSlideIdx}`}
          data-turn={turnDir}
          className="slide-turn-stage relative h-full"
        >
          <div
            className={`h-full grid gap-4 ${
              columns === 2 && (page?.columns.length ?? 1) > 1
                ? 'grid-cols-1 lg:grid-cols-2'
                : 'grid-cols-1 max-w-4xl mx-auto'
            }`}
          >
            {page?.columns.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-3.5 overflow-y-auto no-scrollbar pb-5">
                {col.map((chunk, chi) => (
                  <section
                    key={`${chunk.sectionIdx}-${chi}`}
                    className={`stage-card p-5 space-y-3 ${
                      chunk.type === 'chorus' ? 'stage-card-chorus' : 'bg-surface'
                    }`}
                  >
                    <span
                      className={`inline-flex px-3 py-1 rounded-full typescale-label-sm ${
                        chunk.type === 'chorus'
                          ? 'bg-primary-container text-on-primary-container'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {chunk.label}
                      {chunk.continuation ? ' (cont.)' : ''}
                    </span>

                    {chunk.instrumentalOnly ? (
                      <p className="typescale-body-sm text-on-surface-variant m-0 italic">
                        Trecho instrumental
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {chunk.lines.map((line, li) => {
                          if (!line.trim()) return <div key={li} className="h-1.5" />;
                          const segs = parseLine(line);
                          if (displayMode === 'lyrics-only') {
                            return (
                              <p
                                key={li}
                                className="text-on-surface m-0 py-0.5 leading-relaxed"
                                style={{ fontSize: `${1.05 * activeScale}rem` }}
                              >
                                {segs.map((s) => s.text).join('').replace(/^\s+/, '')}
                              </p>
                            );
                          }
                          if (displayMode === 'chords-only') {
                            return (
                              <div
                                key={li}
                                className="flex flex-wrap gap-3 font-mono font-bold text-primary py-1"
                                style={{ fontSize: `${1.02 * activeScale}rem` }}
                              >
                                {segs
                                  .filter((s) => s.chord)
                                  .map((s, si) => (
                                    <span
                                      key={`${si}-${shiftTracker.dir === 'none' ? 'init' : totalShift}`}
                                      data-shift-dir={shiftTracker.dir === 'none' ? undefined : shiftTracker.dir}
                                      className="chord-settle"
                                    >
                                      {transposeChord(s.chord!, totalShift, useFlats)}
                                    </span>
                                  ))}
                              </div>
                            );
                          }
                          return (
                            <div
                              key={li}
                              className="pt-5 leading-[1.38]"
                              style={{ fontSize: `${1.0 * activeScale}rem` }}
                            >
                              {segs.map((seg, si) => {
                                const chord = seg.chord
                                  ? transposeChord(seg.chord, totalShift, useFlats)
                                  : null;
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
                                      <span
                                        className="font-mono font-bold text-primary absolute left-0 bottom-[calc(100%+3px)] leading-none whitespace-nowrap"
                                        style={{ fontSize: `${0.86 * activeScale}rem` }}
                                      >
                                        <span
                                          key={shiftTracker.dir === 'none' ? 'init' : String(totalShift)}
                                          data-shift-dir={shiftTracker.dir === 'none' ? undefined : shiftTracker.dir}
                                          className="chord-settle"
                                        >
                                          {chord}
                                        </span>
                                      </span>
                                      <span className="text-on-surface whitespace-pre leading-[1.38]">
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
                                    {leadSpace && (
                                      <span className="text-on-surface whitespace-pre">{leadSpace}</span>
                                    )}
                                    <span
                                      className="relative inline-block leading-none"
                                      style={{
                                        minWidth:
                                          tightToNext && anchor.length < chord.length
                                            ? `${chord.length + 0.8}ch`
                                            : undefined,
                                      }}
                                    >
                                      <span
                                        className="font-mono font-bold text-primary absolute left-0 bottom-[calc(100%+3px)] leading-none whitespace-nowrap"
                                        style={{ fontSize: `${0.86 * activeScale}rem` }}
                                      >
                                        <span
                                          key={shiftTracker.dir === 'none' ? 'init' : String(totalShift)}
                                          data-shift-dir={shiftTracker.dir === 'none' ? undefined : shiftTracker.dir}
                                          className="chord-settle"
                                        >
                                          {chord}
                                        </span>
                                      </span>
                                      <span className="text-on-surface whitespace-pre leading-[1.38]">
                                        {anchor}
                                      </span>
                                    </span>
                                    {tail && (
                                      <span className="text-on-surface whitespace-pre-wrap">{tail}</span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            ))}
          </div>

          {/* Persisted freehand strokes overlay (bounding-box SVG for visible focus outline & 24px eraser hit-path) */}
          {pageStrokes.map((stroke) => {
            const tone = NOTE_TONE_MAP[stroke.tone] ?? NOTE_TONE_MAP.amber;
            const color = stroke.tool === 'highlighter' ? tone.hiVar : tone.inkVar;
            const scaledPts: [number, number, number][] = stroke.points.map(([x, y, p]) => [
              x * 16,
              y * 16,
              p,
            ]);
            const d = buildSmoothSvgPath(scaledPts);
            const sw = computeStrokeWidthEm(stroke.tool, stroke.points) * 16;
            const pad = Math.max(sw / 2 + 6, 14);
            let minX = 0;
            let maxX = 0;
            let minY = 0;
            let maxY = 0;
            scaledPts.forEach(([px, py]) => {
              if (px < minX) minX = px;
              if (px > maxX) maxX = px;
              if (py < minY) minY = py;
              if (py > maxY) maxY = py;
            });
            const vx = minX - pad;
            const vy = minY - pad;
            const vw = Math.max(28, maxX - minX + pad * 2);
            const vh = Math.max(28, maxY - minY + pad * 2);
            const erasable = annotateMode && activeTool === 'eraser';
            return (
              <svg
                key={stroke.id}
                role={erasable ? 'button' : undefined}
                tabIndex={erasable ? 0 : undefined}
                aria-label={erasable ? 'Apagar traço desenhado' : undefined}
                aria-hidden={!erasable ? true : undefined}
                viewBox={`${vx} ${vy} ${vw} ${vh}`}
                className={`absolute overflow-visible rounded-lg ${
                  erasable ? 'cursor-pointer' : 'pointer-events-none'
                }`}
                style={{
                  left: `calc(${stroke.originX * 100}% + ${vx}px)`,
                  top: `calc(${stroke.originY * 100}% + ${vy}px)`,
                  width: `${vw}px`,
                  height: `${vh}px`,
                }}
                onClick={(ev) => {
                  if (erasable) {
                    ev.stopPropagation();
                    removeStroke(currentSong.id, stroke.id);
                  }
                }}
                onKeyDown={(ev) => {
                  if (erasable && (ev.key === 'Enter' || ev.key === ' ')) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    removeStroke(currentSong.id, stroke.id);
                    window.requestAnimationFrame(() => {
                      annotateToolbarRef.current
                        ?.querySelector<HTMLElement>('button:not(:disabled)')
                        ?.focus({ preventScroll: true });
                    });
                  }
                }}
              >
                {erasable && (
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(sw, 24)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            );
          })}

          {/* Persisted stage text notes (semantic button only when erasable) */}
          {pageNotes.map((note) => {
            const tone = NOTE_TONE_MAP[note.tone] ?? NOTE_TONE_MAP.amber;
            const erasable = annotateMode && activeTool === 'eraser';
            const posStyle =
              note.align === 'right'
                ? { right: `${Math.max(2, (1 - note.x) * 100)}%`, top: `${note.y * 100}%` }
                : { left: `${note.x * 100}%`, top: `${note.y * 100}%` };
            if (erasable) {
              return (
                <button
                  key={note.id}
                  type="button"
                  aria-label={`Apagar nota: ${note.text}`}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    removeTextNote(currentSong.id, note.id);
                    window.requestAnimationFrame(() => {
                      annotateToolbarRef.current
                        ?.querySelector<HTMLElement>('button:not(:disabled)')
                        ?.focus({ preventScroll: true });
                    });
                  }}
                  className="icon-pop-in absolute min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-full border-none typescale-label-sm cursor-pointer inline-flex items-center justify-center transition-transform hover:scale-105"
                  style={{
                    ...posStyle,
                    background: tone.chipBg,
                    color: tone.chipFg,
                  }}
                  title="Toque para apagar nota"
                >
                  {note.text}
                </button>
              );
            }
            return (
              <span
                key={note.id}
                className="icon-pop-in absolute px-3.5 py-1.5 rounded-full typescale-label-sm pointer-events-none"
                style={{
                  ...posStyle,
                  background: tone.chipBg,
                  color: tone.chipFg,
                }}
              >
                {note.text}
              </span>
            );
          })}

          {/* Active live drawing stroke aligned in the exact same coordinate frame as persisted marks */}
          {liveStrokeD && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <path
                d={liveStrokeD}
                fill="none"
                stroke={
                  activeTool === 'highlighter'
                    ? NOTE_TONE_MAP[activeTone].hiVar
                    : NOTE_TONE_MAP[activeTone].inkVar
                }
                strokeWidth={activeTool === 'highlighter' ? 14 : 3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Bottom pedal/touch bar: single-row on sm+, stacked zero-clipping on mobile < sm */}
      <footer className="relative px-3 sm:px-6 py-2 bg-surface-container-low">
        <span
          aria-hidden="true"
          className="absolute top-0 inset-x-0 h-[2px] bg-primary/70 origin-left pointer-events-none transition-transform duration-300 ease-out"
          style={{
            transform: `scaleX(${Math.max(0.04, (safeSlideIdx + 1) / Math.max(1, slides.length))})`,
          }}
        />
        {annotateMode ? (
          <div
            key="annotate-bar"
            className="dock-enter-bottom w-full flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2"
          >
            <AuroraIconButton
              icon="chevron_left"
              label="Slide anterior"
              variant="tonal"
              disabled={safeSlideIdx === 0 && songIdx === 0}
              onClick={goPrev}
              className="hidden sm:inline-flex"
            />

            <div
              ref={annotateToolbarRef}
              id="slides-annotate-toolbar"
              role="toolbar"
              aria-label="Ferramentas de anotação"
              className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 min-w-0 w-full sm:w-auto"
            >
              <div className="w-full sm:w-auto">
                <AuroraSegmented<AnnotateTool>
                  ariaLabel="Ferramenta de anotação"
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
              </div>

              {activeTool === 'text' && (
                <AuroraButton
                  color="tonal"
                  icon="add_comment"
                  className="icon-pop-in"
                  onClick={() => {
                    setNoteComposer({ x: 0.5, y: 0.2 });
                    setNoteText('');
                  }}
                >
                  Inserir nota
                </AuroraButton>
              )}

              <div className="w-full sm:w-auto flex items-center justify-between sm:justify-center gap-2 flex-wrap">
                {activeTool === 'eraser' ? (
                  <span className="typescale-body-sm text-on-surface-variant px-1">
                    Toque em um traço ou nota para apagar
                  </span>
                ) : (
                  <div className="flex items-center gap-1" role="group" aria-label="Cor da anotação">
                    {NOTE_TONES.map((tone) => {
                      const label = TONE_LABELS_PT[tone.id];
                      return (
                        <button
                          key={tone.id}
                          type="button"
                          aria-label={`Cor ${label}`}
                          title={label}
                          aria-pressed={activeTone === tone.id}
                          onClick={() => setActiveTone(tone.id)}
                          className="swatch-btn"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                            {tone.shape === 'circle' && (
                              <circle cx="8" cy="8" r="6.5" fill={tone.dotColor} />
                            )}
                            {tone.shape === 'diamond' && (
                              <polygon points="8,1 15,8 8,15 1,8" fill={tone.dotColor} />
                            )}
                            {tone.shape === 'square' && (
                              <rect x="2" y="2" width="12" height="12" rx="2.5" fill={tone.dotColor} />
                            )}
                            {tone.shape === 'triangle' && (
                              <polygon points="8,1.5 14.8,13.8 1.2,13.8" fill={tone.dotColor} />
                            )}
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center gap-0.5">
                  <AuroraIconButton
                    icon="undo"
                    label="Desfazer anotação"
                    disabled={!canUndo}
                    onClick={() => undoAnnotation(currentSong.id)}
                  />
                  <AuroraIconButton
                    icon="redo"
                    label="Refazer anotação"
                    disabled={!canRedo}
                    onClick={() => redoAnnotation(currentSong.id)}
                  />
                  {hasAnyAnnotations && (
                    <AuroraIconButton
                      icon="delete_sweep"
                      label="Limpar anotações desta música"
                      onClick={() => setConfirmClearOpen(true)}
                    />
                  )}
                  <AuroraButton
                    color="filled"
                    icon="check"
                    className="hidden sm:inline-flex"
                    onClick={() => setAnnotateMode(false)}
                  >
                    Concluir
                  </AuroraButton>
                </div>
              </div>
            </div>

            <div className="flex sm:hidden items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-1.5">
                <AuroraIconButton
                  icon="chevron_left"
                  label="Slide anterior"
                  variant="tonal"
                  disabled={safeSlideIdx === 0 && songIdx === 0}
                  onClick={goPrev}
                />
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high typescale-label-sm font-mono tabular-nums text-on-surface">
                  {safeSlideIdx + 1} / {slides.length}
                </span>
                <AuroraIconButton
                  icon="chevron_right"
                  label="Próximo slide"
                  variant="tonal"
                  disabled={safeSlideIdx >= slides.length - 1 && songIdx >= deckSongs.length - 1}
                  onClick={goNext}
                />
              </div>
              <AuroraButton color="filled" icon="check" onClick={() => setAnnotateMode(false)}>
                Concluir
              </AuroraButton>
            </div>

            <AuroraIconButton
              icon="chevron_right"
              label="Próximo slide"
              variant="tonal"
              disabled={safeSlideIdx >= slides.length - 1 && songIdx >= deckSongs.length - 1}
              onClick={goNext}
              className="hidden sm:inline-flex"
            />
          </div>
        ) : (
          <div
            key="nav-bar"
            className="dock-enter-bottom w-full flex items-center justify-between gap-2 flex-wrap"
          >
            <AuroraButton
              color="tonal"
              icon="chevron_left"
              disabled={safeSlideIdx === 0 && songIdx === 0}
              onClick={goPrev}
              className="min-h-[48px]"
            >
              {safeSlideIdx === 0 && songIdx > 0 ? 'Música anterior' : 'Anterior'}
            </AuroraButton>

            <div className="flex items-center gap-2.5 min-w-0">
              <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high typescale-label-sm font-mono tabular-nums text-on-surface flex-shrink-0">
                {safeSlideIdx + 1} / {slides.length}
              </span>
              <span className="hidden sm:inline typescale-body-sm text-on-surface-variant truncate">
                Use setas, espaço, deslize, toque nas bordas ou pedal Bluetooth
              </span>
            </div>

            <AuroraButton
              color="filled"
              trailingIcon="chevron_right"
              disabled={safeSlideIdx >= slides.length - 1 && songIdx >= deckSongs.length - 1}
              onClick={goNext}
              className="min-h-[48px]"
            >
              {safeSlideIdx >= slides.length - 1 && songIdx < deckSongs.length - 1
                ? 'Próxima música'
                : 'Próximo'}
            </AuroraButton>
          </div>
        )}
      </footer>

      {/* Confirm clear all song annotations */}
      <AuroraDialog
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
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
            }}
          >
            Limpar tudo
          </AuroraButton>
        </div>
      </AuroraDialog>

      {/* Text note composer modal */}
      <AuroraDialog
        open={Boolean(noteComposer)}
        onClose={() => setNoteComposer(null)}
        title="Adicionar nota de palco no slide"
        subtitle="Escolha uma deixa rápida ou digite seu lembrete"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_NOTE_CUES.map((cue) => (
              <AuroraChip key={cue} onClick={() => commitTextNote(cue)}>
                {cue}
              </AuroraChip>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitTextNote(noteText);
            }}
            className="flex gap-2"
          >
            <label htmlFor="slide-note-text" className="sr-only">
              Texto da anotação
            </label>
            <input
              id="slide-note-text"
              type="text"
              autoFocus
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Ex.: Crescer no 2o refrão"
              className="stage-field flex-1"
            />
            <AuroraButton type="submit" color="filled" disabled={!noteText.trim()}>
              Salvar
            </AuroraButton>
          </form>
        </div>
      </AuroraDialog>

      {/* Mobile slide controls sheet (< md) */}
      <AuroraSheet
        open={slideControlsOpen}
        onClose={() => setSlideControlsOpen(false)}
        title="Ajustes dos slides"
        subtitle={displayTitle}
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="typescale-label-lg text-on-surface">Transposição</div>
            <div className="inline-flex items-center rounded-full bg-surface-container-high px-1">
              <AuroraIconButton
                icon="remove"
                label="Descer meio tom"
                onClick={() => setTranspose((v) => v - 1)}
              />
              <button
                type="button"
                onClick={() => setTranspose(0)}
                aria-label={`Tom atual ${transposePillLabel}. Ativar para restaurar tom original`}
                className="transpose-reset-btn typescale-label-sm font-mono tabular-nums"
              >
                <span
                  key={shiftTracker.dir === 'none' ? 'init' : totalShift}
                  data-shift-dir={shiftTracker.dir === 'none' ? undefined : shiftTracker.dir}
                  className="chord-settle"
                >
                  {transposePillLabel}
                </span>
              </button>
              <AuroraIconButton
                icon="add"
                label="Subir meio tom"
                onClick={() => setTranspose((v) => v + 1)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="typescale-label-lg text-on-surface">Modo de leitura</div>
            <AuroraSegmented<DisplayMode>
              ariaLabel="Modo dos slides no celular"
              value={displayMode}
              onChange={setDisplayMode}
              options={[
                { value: 'both', label: 'Cifra' },
                { value: 'lyrics-only', label: 'Letra' },
                { value: 'chords-only', label: 'Acordes' },
              ]}
            />
          </div>

          <div className="space-y-2">
            <div className="typescale-label-lg text-on-surface">Escala do slide</div>
            <div className="flex flex-wrap items-center gap-2">
              <AuroraChip
                selected={autoFit}
                icon="fit_screen"
                onClick={() => setAutoFit((v) => !v)}
              >
                Autoajuste
              </AuroraChip>
              {!autoFit && (
                <div className="inline-flex items-center rounded-full bg-surface-container-high px-1">
                  <AuroraIconButton
                    icon="text_decrease"
                    label="Diminuir zoom dos slides"
                    onClick={() => setManualScale((s) => Math.max(0.75, Number((s - 0.1).toFixed(2))))}
                  />
                  <span className="typescale-body-sm font-mono tabular-nums px-1">
                    {Math.round(manualScale * 100)}%
                  </span>
                  <AuroraIconButton
                    icon="text_increase"
                    label="Aumentar zoom dos slides"
                    onClick={() => setManualScale((s) => Math.min(1.45, Number((s + 0.1).toFixed(2))))}
                  />
                </div>
              )}
            </div>
          </div>

          {currentSong.capo > 0 && (
            <div className="space-y-2">
              <div className="typescale-label-lg text-on-surface">Capotraste</div>
              <AuroraChip
                selected={capoDisplay === 'shapes'}
                onClick={() => setCapoDisplay(capoDisplay === 'shapes' ? 'sounding' : 'shapes')}
              >
                {capoDisplay === 'shapes' ? `Formas (Capo ${currentSong.capo})` : 'Som real'}
              </AuroraChip>
            </div>
          )}
        </div>
      </AuroraSheet>

      {/* Setlist deck drawer */}
      <AuroraSheet
        open={deckOpen}
        onClose={() => setDeckOpen(false)}
        title={activeSetlist?.name ?? 'Sequência'}
        subtitle={`${deckSongs.length} ${deckSongs.length === 1 ? 'música' : 'músicas'} neste conjunto`}
      >
        <ol className="m-0 p-0 list-none space-y-1.5">
          {deckSongs.map((s, idx) => {
            const active = idx === songIdx;
            const info = getDisplayTitleAndArtist(s);
            const key = getEffectiveKey(s).key;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => {
                    setTurnDir('none');
                    setSongIdx(idx);
                    setSlideIdx(0);
                    setTranspose(0);
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
                  <span className="typescale-label-sm font-mono flex-shrink-0">
                    {key || '-'}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </AuroraSheet>
    </main>
  );
}
