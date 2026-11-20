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
import { useDisplayStore, type DisplayMode } from '@/lib/stores/display-store';
import { useWakeLock } from '@/lib/hooks/use-wake-lock';
import {
  SECTION_COLORS,
  isMinorKey,
  shouldPreferFlats,
  transposeChord,
  transposeLine,
} from '@/lib/utils/music';
import {
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
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ColumnsIcon,
  MenuListIcon,
  MoonIcon,
  SunIcon,
} from '@/components/ui/Icons';

const SWIPE_MIN_DX = 48;
const SWIPE_MAX_DT = 650;
const SWIPE_DX_DY_RATIO = 1.35;
const DRAG_CANCEL_PX = 10;
const EDGE_GUARD_PX = 20;
const KEY_DEBOUNCE_MS = 140;
const COL_GAP_PX = 16;
const CARD_GAP_PX = 12;
const HEIGHT_SAFETY_PX = 4;
const SINGLE_COL_MAX_PX = 860;
const MIN_FONT_SIZE = 70;
const MAX_FONT_SIZE = 180;

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

interface SlideSectionCardProps {
  chunk: SlideChunk;
  displayMode: DisplayMode;
}

function SlideSectionCard({ chunk, displayMode }: SlideSectionCardProps) {
  const colors = SECTION_COLORS[chunk.type] || SECTION_COLORS.verse;
  const isLyricsOnly = displayMode === 'lyrics-only';
  const isChorus = chunk.type === 'chorus';

  if (chunk.instrumentalOnly) {
    return (
      <section
        className="rounded-[24px] px-4 py-2.5 flex items-center gap-2 flex-shrink-0"
        style={{ background: colors.bg }}
      >
        <div
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
          style={{ backgroundColor: colors.pillBg }}
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: colors.bd }}
            aria-hidden="true"
          />
          <h2 className="font-display text-sm font-semibold leading-tight" style={{ color: colors.lb }}>
            {chunk.label}
          </h2>
        </div>
        <span className="text-xs text-[var(--muted)]">· trecho instrumental</span>
      </section>
    );
  }

  return (
    <section
      className={`rounded-[24px] flex-shrink-0 ${
        isLyricsOnly ? 'px-5 py-3.5' : 'px-4 sm:px-5 py-3'
      }`}
      style={{ background: colors.bg }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
          style={{ backgroundColor: colors.pillBg }}
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: colors.bd }}
            aria-hidden="true"
          />
          <h2 className="font-display text-sm font-semibold leading-tight" style={{ color: colors.lb }}>
            {chunk.label}
            {chunk.continuation ? ' (cont.)' : ''}
          </h2>
        </div>
      </div>

      <div className={isLyricsOnly ? 'space-y-1.5' : 'space-y-0.5'}>
        {chunk.lines.map((line, idx) => (
          <ChordLine
            key={`${chunk.startLineIdx}-${idx}`}
            line={line}
            onChordTap={noopChordTap}
            displayMode={displayMode}
            interactiveChords={false}
            inChorus={isChorus}
          />
        ))}
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
    fontSize,
    setFontSize,
    theme,
    setTheme,
    capoDisplay,
    setCapoDisplay,
    singleKeyShortcuts,
  } = useDisplayStore();

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
  const [stageBox, setStageBox] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [fontsTick, setFontsTick] = useState(0);
  const [deckLayout, setDeckLayout] = useState<DeckLayoutState>({
    songId: '',
    pages: [],
    pageIdx: 0,
  });
  const [showSetlistDrawer, setShowSetlistDrawer] = useState(false);

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
  const touchRef = useRef<{
    x: number;
    y: number;
    t: number;
    horizontal: boolean;
    moved: boolean;
  } | null>(null);
  const lastSwipeAtRef = useRef(0);
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

  const announce = useCallback((msg: string) => {
    // Alternate trailing invisible suffix so repeated hits (e.g. start/end boundary) always re-announce in VoiceOver
    liveParityRef.current = !liveParityRef.current;
    setLiveStatus(liveParityRef.current ? msg : `${msg}\u00A0`);
  }, []);

  // Resolve current index safely from activeSongId (survives SetlistDrawer reorders cleanly)
  const safeSongIdx = useMemo(() => {
    const idx = songs.findIndex((s) => s.id === activeSongId);
    return idx >= 0 ? idx : 0;
  }, [songs, activeSongId]);

  const rawSong = songs[safeSongIdx] ?? songs[0];

  // Keep ?song=<id> in URL synced silently so an iPadOS Safari tab reload restores the current gig song
  useEffect(() => {
    if (!activeSetlist || !rawSong || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('song') !== rawSong.id) {
      url.searchParams.set('song', rawSong.id);
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    }
  }, [activeSetlist, rawSong]);

  // Accurate musical transposition matching SongPage + ChordBadge:
  // {key:} is always the concert sounding key; chords in .cho body are capo shapes.
  // Sounding mode shifts body chords UP by +capo; shapes mode leaves body chords at +0.
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

  // Landscape tablet/desktop (>= 900px) supports 2-column book spreads; Portrait stays crisp 1-column
  const canUseTwoCols = stageBox.width >= 900;
  const effectiveCols: 1 | 2 = useMemo(() => {
    if (!canUseTwoCols) return 1;
    if (colsPref === 1 || colsPref === 2) return colsPref;
    return stageBox.width >= 900 && stageBox.width > stageBox.height ? 2 : 1;
  }, [canUseTwoCols, colsPref, stageBox.width, stageBox.height]);

  const measureColWidth = useMemo(() => {
    if (stageBox.width <= 0) return 0;
    if (effectiveCols === 2) {
      return Math.max(260, Math.floor((stageBox.width - COL_GAP_PX) / 2));
    }
    return Math.max(260, Math.floor(Math.min(stageBox.width, SINGLE_COL_MAX_PX)));
  }, [stageBox.width, effectiveCols]);

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

  // Measure pure rendered card & line heights in hidden mirror and pack into zero-overflow slides
  useLayoutEffect(() => {
    if (!rawSong || stageBox.height <= 0 || measureColWidth <= 0) return;
    const targetSongId = rawSong.id;

    const rafId = requestAnimationFrame(() => {
      const mirror = measureRef.current;
      if (!mirror) return;

      const lineGap = displayMode === 'lyrics-only' ? 6 : 2;
      const sectionEls = mirror.querySelectorAll<HTMLElement>('[data-measure-section]');
      const metrics: SlideSectionMetrics[] = [];

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
        lineEls.forEach((lineEl, idx) => {
          const lh = Math.ceil(lineEl.getBoundingClientRect().height);
          lineHeights.push(lh + (idx > 0 ? lineGap : 0));
        });
        metrics.push({ fullHeight: pureFullHeight, chromeHeight, lineHeights });
      });

      const usableHeight = Math.max(140, stageBox.height - HEIGHT_SAFETY_PX);
      const nextPages = packSectionsIntoSlides(
        preparedSections,
        metrics,
        usableHeight,
        effectiveCols,
        CARD_GAP_PX
      );

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

      setDeckLayout({ songId: targetSongId, pages: nextPages, pageIdx: resolvedPageIdx });
    });

    return () => cancelAnimationFrame(rafId);
  }, [
    rawSong,
    preparedSections,
    stageBox.height,
    measureColWidth,
    effectiveCols,
    fontSize,
    displayMode,
    fontsTick,
    announce,
  ]);

  const isLayoutSynced = Boolean(rawSong && deckLayout.songId === rawSong.id);
  const pages = isLayoutSynced ? deckLayout.pages : [];
  const totalPages = Math.max(1, pages.length);
  const safePageIdx = isLayoutSynced
    ? Math.min(Math.max(0, deckLayout.pageIdx), totalPages - 1)
    : 0;
  const activeSlide = isLayoutSynced ? pages[safePageIdx] ?? null : null;

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

  const showSongBoundaryBanner = useCallback((idx: number, song: ParsedSong) => {
    if (prefersReducedMotion()) return;
    const keyPart = song.displayKey ? ` · ${song.displayKey}` : '';
    const prefix = songs.length > 1 ? `${idx + 1}/${songs.length} · ` : '';
    setSongBanner((prev) => ({ text: `${prefix}${song.title}${keyPart}`, seq: (prev?.seq ?? 0) + 1 }));
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => setSongBanner(null), 1400);
  }, [songs.length]);

  const goNext = useCallback(() => {
    if (!isLayoutSynced) return;
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
      pendingPageRef.current = { kind: 'first', announceSong: `Próxima música: ${targetSong.title}` };
      currentAnchorRef.current = { sectionIdx: 0, lineIdx: 0 };
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
      pendingPageRef.current = { kind: 'last', announceSong: `Música anterior: ${targetSong.title}` };
      currentAnchorRef.current = { sectionIdx: 0, lineIdx: 0 };
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
      const targetSong = songs[idx];
      const dir = idx > safeSongIdx ? 'next' : 'prev';
      pendingPageRef.current = { kind: 'first', announceSong: targetSong.title };
      currentAnchorRef.current = { sectionIdx: 0, lineIdx: 0 };
      setActiveSongId(targetSong.id);
      setTurnAnim((prev) => ({ dir, seq: prev.seq + 1 }));
      showSongBoundaryBanner(idx, targetSong);
    },
    [songs, safeSongIdx, showSongBoundaryBanner]
  );

  // Bluetooth page-turner pedals (AirTurn, PageFlip, Donner, presenters) + keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;

      // Never intercept keys while any modal dialog (SetlistDrawer, QuickSearchModal, ShortcutsModal) is open
      const modalOpen = Boolean(
        showSetlistDrawer || document.querySelector('[role="dialog"][aria-modal="true"]')
      );

      if (e.key === 'Escape') {
        if (modalOpen) return;
        e.preventDefault();
        if (rawSong) onExit(rawSong.id);
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
  }, [showSetlistDrawer, singleKeyShortcuts, rawSong, onExit, goNext, goPrev]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
      if (edgeTimerRef.current) clearTimeout(edgeTimerRef.current);
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, []);

  // Touch swipe & tap-zone handlers on the slide stage (with palm-rejection onTouchCancel + drag guard)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || showSetlistDrawer) return;
    const t = e.touches[0];
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
    const start = touchRef.current;
    if (!start || e.touches.length !== 1) return;
    const t = e.touches[0];
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
    const start = touchRef.current;
    touchRef.current = null;
    resetSwipeLayer();
    if (!start || e.changedTouches.length !== 1) return;

    const t = e.changedTouches[0];
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
      // Suppress synthetic click after an aborted/short drag so lifting the finger never misfires
      lastSwipeAtRef.current = Date.now();
    }
  };

  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() - lastSwipeAtRef.current < 360) return;
    if (e.clientX < EDGE_GUARD_PX || e.clientX > window.innerWidth - EDGE_GUARD_PX) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('button, a, [role="dialog"]')) return;

    // Clear stale toolbar focus so subsequent Space/Enter Bluetooth pedal turns pages cleanly
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
    // In 2-column book spread: left half = Prev, right half = Next; in 1-col: left 32% = Prev, right 68% = Next
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

  const prevAriaLabel =
    safePageIdx === 0 && prevSong ? `Música anterior: ${prevSong.title}` : 'Página anterior';
  const nextAriaLabel =
    isLastPageOfSong && nextSong ? `Próxima música: ${nextSong.title}` : 'Próxima página';

  const handleAdjustFont = (delta: number, e: React.MouseEvent<HTMLButtonElement>) => {
    blurOnPointer(e);
    const next = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, fontSize + delta));
    if (next === fontSize) {
      announce(delta < 0 ? `Fonte no mínimo (${MIN_FONT_SIZE}%)` : `Fonte no máximo (${MAX_FONT_SIZE}%)`);
      return;
    }
    pendingPageRef.current = { kind: 'anchor', ...currentAnchorRef.current };
    setFontSize(next);
    announce(`Fonte ${next}%`);
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

  return (
    <div
      data-motion-scheme="standard"
      data-slides-mode="true"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)] text-[var(--ink)] select-none overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Accessible page-turn and state announcements for iPadOS VoiceOver / screen readers */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </div>

      {/* Slim, border-free GM3 Stage Top Bar (pure tonal hierarchy per DESIGN.md) */}
      <header className="flex-shrink-0 bg-[var(--bg)] px-3 sm:px-5 pt-2.5 pb-1.5">
        <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-2">
          {/* Left: Exit + Setlist counter + Song Title, Key & optional Capo toggle */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={(e) => {
                blurOnPointer(e);
                onExit(rawSong.id);
              }}
              aria-label="Sair do modo slides"
              title="Sair (Esc)"
              className="pill-btn h-11 min-w-11 px-3 text-sm flex-shrink-0"
            >
              <CloseIcon size={17} />
              <span className="hidden lg:inline">Sair</span>
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
                className="pill-btn h-11 px-3 text-xs font-mono tabular-nums flex-shrink-0"
              >
                <MenuListIcon size={15} />
                <span>
                  {safeSongIdx + 1}/{songs.length}
                </span>
              </button>
            )}

            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h1
                title={rawSong.title}
                className="font-display font-bold text-lg sm:text-xl text-[var(--ink)] truncate leading-tight"
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
              {rawSong.capo > 0 && (
                <button
                  type="button"
                  onClick={handleToggleCapo}
                  aria-pressed={capoDisplay === 'shapes'}
                  aria-label={
                    capoDisplay === 'shapes'
                      ? `Capo ${rawSong.capo}: mostrando posições de capo, toque para tom real`
                      : `Capo ${rawSong.capo}: mostrando tom real, toque para posições de capo`
                  }
                  title={
                    capoDisplay === 'shapes'
                      ? `Posições com Capo ${rawSong.capo} (toque para tom real)`
                      : `Tom real (toque para posições com Capo ${rawSong.capo})`
                  }
                  className={`pill-btn h-11 min-w-11 px-2.5 sm:px-3 text-xs flex-shrink-0 ${
                    capoDisplay === 'shapes'
                      ? 'bg-[var(--tune-dim)] text-[var(--tune)] gm3-stage-active-ring'
                      : 'bg-[var(--surface)] text-[var(--tune)]'
                  }`}
                >
                  <span className="sm:hidden">
                    {capoDisplay === 'shapes' ? `C${rawSong.capo}` : 'Real'}
                  </span>
                  <span className="hidden sm:inline">
                    {capoDisplay === 'shapes' ? `Capo ${rawSong.capo}` : `Tom real (C${rawSong.capo})`}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Right: 4 simple controls only — matches SongHeader order: Cifra | Letra | Acordes */}
          <div className="flex items-center gap-1.5 flex-shrink-0 w-full md:w-auto justify-between md:justify-end">
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
                    className={`gm3-connected-btn h-11 px-3 text-xs cursor-pointer ${
                      selected ? 'font-semibold gm3-stage-active-ring' : 'font-medium'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </ConnectedGroup>

            <div className="gm3-btn-group flex-shrink-0">
              <button
                type="button"
                onClick={(e) => handleAdjustFont(-10, e)}
                aria-disabled={fontSize <= MIN_FONT_SIZE}
                aria-label={`Diminuir fonte (atual ${fontSize}%)`}
                title={`Diminuir fonte (${fontSize}%)`}
                className={`pill-btn h-11 w-11 text-xs font-mono ${
                  fontSize <= MIN_FONT_SIZE ? 'opacity-40' : ''
                }`}
              >
                A-
              </button>
              <button
                type="button"
                onClick={(e) => handleAdjustFont(10, e)}
                aria-disabled={fontSize >= MAX_FONT_SIZE}
                aria-label={`Aumentar fonte (atual ${fontSize}%)`}
                title={`Aumentar fonte (${fontSize}%)`}
                className={`pill-btn h-11 w-11 text-xs font-mono ${
                  fontSize >= MAX_FONT_SIZE ? 'opacity-40' : ''
                }`}
              >
                A+
              </button>
            </div>

            {canUseTwoCols && (
              <button
                type="button"
                onClick={handleToggleCols}
                aria-pressed={effectiveCols === 2}
                aria-label="2 colunas"
                title={effectiveCols === 2 ? '2 colunas (toque para 1 coluna)' : '1 coluna (toque para 2 colunas)'}
                className={`pill-btn h-11 min-w-11 px-3 text-xs flex-shrink-0 ${
                  effectiveCols === 2 ? 'pill-btn-tonal font-semibold gm3-stage-active-ring' : ''
                }`}
              >
                <ColumnsIcon size={15} />
                <span>2 col</span>
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
              className="pill-btn h-11 w-11 flex-shrink-0"
            >
              {isDark ? <SunIcon size={17} /> : <MoonIcon size={17} />}
            </button>
          </div>
        </div>
      </header>

      {/* Optional compact stage cue bar (constant height across all pages of a song with notes) */}
      {rawSong.notes && (
        <div className="flex-shrink-0 px-3 sm:px-5 pt-1">
          <div
            title={rawSong.notes}
            className="rounded-2xl bg-[var(--warn-dim)] text-[var(--warn-ink)] px-3.5 py-1.5 text-xs font-medium line-clamp-2"
          >
            {rawSong.notes}
          </div>
        </div>
      )}

      {/* Full-viewport Slide Stage (Tap Left = Back, Tap Right = Next, Swipe, Bluetooth Pedal) */}
      <main
        id="main-content"
        tabIndex={-1}
        data-slides-stage="true"
        onClick={handleStageClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        className="relative flex-1 min-h-0 overflow-hidden px-3 sm:px-5 lg:px-7 py-2 sm:py-3 cursor-pointer focus:outline-none"
      >
        {/* Subtle peripheral edge pulse when turning pages (auto-cleared & skipped under reduced motion) */}
        {edgeFlash && (
          <div
            key={edgeFlash.seq}
            aria-hidden="true"
            onAnimationEnd={() => setEdgeFlash(null)}
            className={`gm3-edge-pulse pointer-events-none absolute inset-y-3 w-12 z-20 rounded-2xl ${
              edgeFlash.side === 'left'
                ? 'left-1.5 bg-gradient-to-r from-[var(--accent)]/25 to-transparent'
                : 'right-1.5 bg-gradient-to-l from-[var(--accent)]/25 to-transparent'
            }`}
          />
        )}

        {/* Brief non-blocking song boundary cue pill (bottom-center so it never covers top section headers) */}
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

        <div ref={stageInnerRef} className="relative w-full h-full overflow-hidden">
          {/* Hidden exact-width DOM measurement mirror driving zero-overflow pagination */}
          {measureColWidth > 0 && (
            <div
              ref={measureRef}
              aria-hidden="true"
              inert
              className="pointer-events-none invisible absolute top-0 left-0 -z-10"
              style={
                {
                  width: `${measureColWidth}px`,
                  fontSize: `${fontSize}%`,
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
                      className="rounded-[24px] px-4 py-2.5 flex items-center gap-2"
                    >
                      <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" />
                        <span className="font-display text-sm font-semibold">{sec.label}</span>
                      </div>
                      <span className="text-xs">· trecho instrumental</span>
                    </section>
                  );
                }
                return (
                  <section
                    key={sec.sectionIdx}
                    data-measure-section={sec.sectionIdx}
                    className={`rounded-[24px] ${
                      isLyricsOnly ? 'px-5 py-3.5' : 'px-4 sm:px-5 py-3'
                    }`}
                    style={{ background: colors.bg }}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" />
                        <span className="font-display text-sm font-semibold leading-tight">
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

          {/* Visible Paginated Slide */}
          <div
            ref={swipeLayerRef}
            className="w-full h-full flex items-stretch justify-center"
          >
            {isLayoutSynced && (
              <div
                key={`${rawSong.id}-${safePageIdx}-${turnAnim.seq}`}
                data-slide-page={safePageIdx + 1}
                data-slide-total={totalPages}
                className={`${slideAnimClass} w-full h-full ${
                  effectiveCols === 2 && !singleSpread
                    ? 'grid grid-cols-2 gap-4 items-start'
                    : 'flex justify-center'
                }`}
                style={{ fontSize: `${fontSize}%` }}
              >
                {activeSlide && activeSlide.columns.some((c) => c.length > 0) ? (
                  activeSlide.columns.map((colChunks, colIdx) => (
                    <div
                      key={colIdx}
                      data-slide-column={colIdx}
                      className={`h-full overflow-y-auto no-scrollbar flex flex-col gap-3 ${
                        effectiveCols === 1
                          ? 'w-full max-w-[860px]'
                          : singleSpread
                          ? 'w-full'
                          : 'min-w-0 w-full'
                      }`}
                      style={
                        effectiveCols === 2 && singleSpread && measureColWidth > 0
                          ? { maxWidth: `${measureColWidth}px` }
                          : undefined
                      }
                    >
                      {colChunks.map((chunk) => (
                        <SlideSectionCard
                          key={`${chunk.sectionIdx}-${chunk.startLineIdx}`}
                          chunk={chunk}
                          displayMode={displayMode}
                        />
                      ))}
                    </div>
                  ))
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-[var(--muted)]">
                    {displayMode === 'chords-only'
                      ? 'Esta música não tem acordes marcados.'
                      : 'Nenhum conteúdo para exibir neste modo.'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Slim Border-Free Bottom Bar with Expressive Page Progress + Neutral Next-Song Preview */}
      <footer className="flex-shrink-0 bg-[var(--bg)] px-3 sm:px-5 pt-1.5 pb-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={(e) => {
            blurOnPointer(e);
            goPrev();
          }}
          aria-disabled={atDeckStart}
          aria-label={prevAriaLabel}
          className={`pill-btn h-11 px-4 text-sm font-medium flex-shrink-0 ${
            atDeckStart ? 'opacity-40' : ''
          }`}
        >
          <ChevronLeftIcon size={16} />
          <span>{safePageIdx === 0 && prevSong ? 'Anterior' : 'Anterior'}</span>
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
          onClick={(e) => {
            blurOnPointer(e);
            goNext();
          }}
          aria-disabled={atDeckEnd}
          aria-label={nextAriaLabel}
          className={`pill-btn pill-btn-tonal h-11 px-4 text-sm font-medium flex-shrink-0 ${
            atDeckEnd ? 'opacity-40' : ''
          }`}
        >
          <span>{isLastPageOfSong && nextSong ? 'Próxima música' : 'Próxima'}</span>
          <ChevronRightIcon size={16} />
        </button>
      </footer>

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
