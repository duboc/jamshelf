'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Song } from '@/lib/types/song';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import {
  computeEffectiveDurationSec,
  computeLinearRatePxPerSec,
  estimateSectionMarks,
  hasUsableMarks,
  interpolateMarkedScroll,
  scrollTopToMarkedElapsed,
} from '@/lib/utils/autoscroll';
import { SectionBlock } from './SectionBlock';

const QUICK_SECTION_PRESETS = ['Verso', 'Refrão', 'Pré-refrão', 'Ponte', 'Intro', 'Solo', 'Outro'];
const USER_SCROLL_PAUSE_MS = 1400;

interface ChordSheetProps {
  song: Song;
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
  onAddSection?: (label: string) => void;
  // Calibration props
  calibrating?: boolean;
  calibrationMarks?: (number | null)[];
  calibrationTargetIdx?: number;
  onCalibrationTap?: (sectionIdx: number) => void;
  // Live-session & navigation props
  onScrollStateChange?: (state: { scrollTop: number; scrollRatio: number; maxScroll: number }) => void;
  syncCorrection?: { scrollTop: number; scrollRatio: number | null; nonce: number };
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onActiveSectionChange?: (sectionIdx: number) => void;
  arrivedSectionIdx?: number | null;
  bottomPaddingClass?: string;
  allowMultiColumn?: boolean;
}

export function ChordSheet({
  song,
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
  onAddSection,
  calibrating = false,
  calibrationMarks,
  calibrationTargetIdx,
  onCalibrationTap,
  onScrollStateChange,
  syncCorrection,
  scrollContainerRef,
  onActiveSectionChange,
  arrivedSectionIdx = null,
  bottomPaddingClass = 'pb-20',
  allowMultiColumn = true,
}: ChordSheetProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const scrollRef = scrollContainerRef ?? internalRef;
  const { isAutoScrolling, autoScrollSpeed, bpm, setAutoScrolling } = usePlayerStore();
  const fontSize = useDisplayStore((s) => s.fontSize);
  const scrollLeadInSec = useDisplayStore((s) => s.scrollLeadInSec);
  const sheetColumns = useDisplayStore((s) => s.sheetColumns);

  const [leadInLeft, setLeadInLeft] = useState(0);
  const [userPausedNotice, setUserPausedNotice] = useState(false);
  const [fitsScreenNotice, setFitsScreenNotice] = useState(false);

  const progressBarRef = useRef<HTMLDivElement>(null);
  const contentWrapRef = useRef<HTMLDivElement>(null);
  const sectionTopsRef = useRef<number[]>([]);
  const lastActiveSectionRef = useRef<number>(-1);

  const speedRef = useRef(autoScrollSpeed);
  useEffect(() => {
    speedRef.current = autoScrollSpeed;
  }, [autoScrollSpeed]);

  const bpmRef = useRef(bpm);
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  const songRef = useRef(song);
  useEffect(() => {
    songRef.current = song;
  }, [song]);

  // Tracks manual wheel/touch override so auto-scroll yields to the musician's hand
  const userPauseUntilRef = useRef(0);
  const userTouchedRef = useRef(false);
  const easeCancelRef = useRef<number | null>(null);
  const syncElapsedRef = useRef<((scrollTop: number) => void) | null>(null);

  const measureSectionTops = useCallback((el: HTMLDivElement): number[] => {
    const nodes = el.querySelectorAll<HTMLElement>('[data-section-idx]');
    const tops: number[] = [];
    nodes.forEach((node) => {
      const idx = Number(node.dataset.sectionIdx ?? 0);
      tops[idx] = Math.max(0, node.offsetTop - 16);
    });
    sectionTopsRef.current = tops;
    return tops;
  }, []);

  const effectiveDisplayMode = editMode ? 'both' : displayMode;
  const isSingerMode = effectiveDisplayMode === 'lyrics-only';
  const useTwoColumns = allowMultiColumn && sheetColumns === 2 && !editMode && !calibrating;

  // Keep cached section offsets fresh only when content width/height changes (never fires on header collapse!)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    lastActiveSectionRef.current = -1;
    let rafId = 0;
    const scheduleRefresh = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        measureSectionTops(el);
      });
    };
    scheduleRefresh();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && contentWrapRef.current) {
      ro = new ResizeObserver(scheduleRefresh);
      ro.observe(contentWrapRef.current);
    }
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro?.disconnect();
    };
  }, [
    scrollRef,
    measureSectionTops,
    song.id,
    song.sections.length,
    fontSize,
    effectiveDisplayMode,
    useTwoColumns,
    editMode,
  ]);

  // Reset scroll to top when switching songs
  useEffect(() => {
    if (scrollRef.current && !syncCorrection) {
      scrollRef.current.scrollTop = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  // Lead-in countdown when starting auto-scroll near the top of the song
  const leadInTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const skipLeadInRef = useRef(false);

  useEffect(() => {
    if (leadInTimerRef.current) {
      clearInterval(leadInTimerRef.current);
      leadInTimerRef.current = null;
    }
    if (!isAutoScrolling) {
      const t = setTimeout(() => {
        setLeadInLeft(0);
        setUserPausedNotice(false);
      }, 0);
      return () => clearTimeout(t);
    }

    const el = scrollRef.current;
    const nearTop = !el || el.scrollTop < 40;
    const shouldCountdown = !syncCorrection && !skipLeadInRef.current && nearTop && scrollLeadInSec > 0;
    skipLeadInRef.current = false;

    if (!shouldCountdown) {
      const t = setTimeout(() => setLeadInLeft(0), 0);
      return () => clearTimeout(t);
    }

    let remaining = scrollLeadInSec;
    const startT = setTimeout(() => setLeadInLeft(remaining), 0);
    leadInTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (leadInTimerRef.current) clearInterval(leadInTimerRef.current);
        leadInTimerRef.current = null;
        setLeadInLeft(0);
      } else {
        setLeadInLeft(remaining);
      }
    }, 1000);

    return () => {
      clearTimeout(startT);
      if (leadInTimerRef.current) {
        clearInterval(leadInTimerRef.current);
        leadInTimerRef.current = null;
      }
    };
  }, [isAutoScrolling, scrollLeadInSec, syncCorrection, scrollRef]);

  // Listen for manual user scroll gestures so auto-scroll yields gracefully
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let clearNoticeTimer: ReturnType<typeof setTimeout> | null = null;
    const onUserInteract = () => {
      if (!usePlayerStore.getState().isAutoScrolling) return;
      userPauseUntilRef.current = performance.now() + USER_SCROLL_PAUSE_MS;
      userTouchedRef.current = true;
      setUserPausedNotice(true);
      if (clearNoticeTimer) clearTimeout(clearNoticeTimer);
      clearNoticeTimer = setTimeout(() => setUserPausedNotice(false), USER_SCROLL_PAUSE_MS);
    };

    el.addEventListener('wheel', onUserInteract, { passive: true });
    el.addEventListener('touchstart', onUserInteract, { passive: true });
    el.addEventListener('touchmove', onUserInteract, { passive: true });
    return () => {
      if (clearNoticeTimer) clearTimeout(clearNoticeTimer);
      el.removeEventListener('wheel', onUserInteract);
      el.removeEventListener('touchstart', onUserInteract);
      el.removeEventListener('touchmove', onUserInteract);
    };
  }, [scrollRef]);

  // Core smart auto-scroll loop (manual calibrated marks > auto section-weighted marks > linear)
  useEffect(() => {
    if (!isAutoScrolling || leadInLeft > 0) return;
    const el = scrollRef.current;
    if (!el) return;

    const maxScroll0 = Math.max(0, el.scrollHeight - el.clientHeight);
    if (maxScroll0 <= 2) {
      setAutoScrolling(false);
      setFitsScreenNotice(true);
      const t = setTimeout(() => setFitsScreenNotice(false), 2600);
      return () => clearTimeout(t);
    }

    let frameId: number;
    let last = performance.now();
    let position = el.scrollTop;

    const getMarksForSong = (s: Song, dur: number): number[] | null => {
      if (hasUsableMarks(s.sectionMarks, s.sections.length)) {
        return s.sectionMarks;
      }
      if (s.sections.length >= 2) {
        return estimateSectionMarks(s, dur);
      }
      return null;
    };

    const currentSong = songRef.current;
    const durationSec0 = computeEffectiveDurationSec(currentSong, bpmRef.current);
    const sectionTops0 =
      sectionTopsRef.current.length > 0 ? sectionTopsRef.current : measureSectionTops(el);
    const marks0 = getMarksForSong(currentSong, durationSec0);
    const setProgressGpu = (ratio: number) => {
      if (progressBarRef.current) {
        const clamped = Math.max(0, Math.min(1, ratio));
        progressBarRef.current.style.transform = `scaleX(${clamped})`;
      }
    };
    setProgressGpu(maxScroll0 > 0 ? position / maxScroll0 : 0);

    let elapsedSec = marks0
      ? scrollTopToMarkedElapsed(
          position,
          marks0,
          sectionTops0,
          maxScroll0,
          durationSec0,
          el.clientHeight
        )
      : 0;

    syncElapsedRef.current = (newTop: number) => {
      position = newTop;
      const s = songRef.current;
      const maxS = Math.max(0, el.scrollHeight - el.clientHeight);
      const dur = computeEffectiveDurationSec(s, bpmRef.current);
      const m = getMarksForSong(s, dur);
      if (m) {
        const tops = sectionTopsRef.current.length > 0 ? sectionTopsRef.current : measureSectionTops(el);
        elapsedSec = scrollTopToMarkedElapsed(
          newTop,
          m,
          tops,
          maxS,
          dur,
          el.clientHeight
        );
      }
    };

    const step = (now: number) => {
      const dt = Math.min(0.15, Math.max(0, (now - last) / 1000));
      last = now;

      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      if (maxScroll <= 1) {
        setAutoScrolling(false);
        return;
      }

      const s = songRef.current;
      const dur = computeEffectiveDurationSec(s, bpmRef.current);
      const marks = getMarksForSong(s, dur);
      const tops = sectionTopsRef.current.length > 0 ? sectionTopsRef.current : measureSectionTops(el);

      // If user recently scrolled manually, yield and track their new position
      if (now < userPauseUntilRef.current) {
        position = el.scrollTop;
        if (marks) {
          elapsedSec = scrollTopToMarkedElapsed(
            position,
            marks,
            tops,
            maxScroll,
            dur,
            el.clientHeight
          );
        }
        setProgressGpu(position / maxScroll);
        frameId = requestAnimationFrame(step);
        return;
      }

      // Re-sync once immediately after a manual pause ends
      if (userTouchedRef.current) {
        userTouchedRef.current = false;
        position = el.scrollTop;
        if (marks) {
          elapsedSec = scrollTopToMarkedElapsed(
            position,
            marks,
            tops,
            maxScroll,
            dur,
            el.clientHeight
          );
        }
      }

      if (marks) {
        elapsedSec += dt * speedRef.current;
        position = interpolateMarkedScroll(
          elapsedSec,
          marks,
          tops,
          maxScroll,
          dur,
          el.clientHeight
        );
      } else {
        const pxPerSec = computeLinearRatePxPerSec(maxScroll, dur, speedRef.current);
        position += pxPerSec * dt;
      }

      if (position >= maxScroll - 0.5) {
        el.scrollTop = maxScroll;
        setProgressGpu(1);
        setAutoScrolling(false);
        return;
      }

      el.scrollTop = position;
      setProgressGpu(position / maxScroll);
      frameId = requestAnimationFrame(step);
    };

    frameId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frameId);
      syncElapsedRef.current = null;
    };
  }, [isAutoScrolling, leadInLeft, scrollRef, measureSectionTops, setAutoScrolling]);

  // Report normalized scroll state for live-session sync + track active visible section (zero DOM queries during scroll)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      const scrollRatio = maxScroll > 0 ? Math.max(0, Math.min(1, el.scrollTop / maxScroll)) : 0;
      onScrollStateChange?.({ scrollTop: el.scrollTop, scrollRatio, maxScroll });

      if (onActiveSectionChange) {
        const tops = sectionTopsRef.current;
        let currentIdx = 0;
        const topThreshold = el.scrollTop + 96;
        for (let i = 0; i < tops.length; i++) {
          const t = tops[i];
          if (t !== undefined && t + 16 <= topThreshold) {
            currentIdx = i;
          } else if (t !== undefined) {
            break;
          }
        }
        if (currentIdx !== lastActiveSectionRef.current) {
          lastActiveSectionRef.current = currentIdx;
          onActiveSectionChange(currentIdx);
        }
      }
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [onScrollStateChange, onActiveSectionChange, scrollRef]);

  // Smoothly ease follower scroll to leader's normalized scrollRatio (with fallback to scrollTop)
  useEffect(() => {
    if (!syncCorrection) return;
    const el = scrollRef.current;
    if (!el) return;

    if (easeCancelRef.current !== null) {
      cancelAnimationFrame(easeCancelRef.current);
      easeCancelRef.current = null;
    }

    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    const target =
      syncCorrection.scrollRatio !== null && maxScroll > 0
        ? syncCorrection.scrollRatio * maxScroll
        : Math.max(0, Math.min(maxScroll, syncCorrection.scrollTop));

    const start = el.scrollTop;
    const delta = target - start;

    // Small drift -> ignore; large jump or reduced motion -> snap; medium drift -> ease smoothly over 280ms
    if (Math.abs(delta) < 4) return;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (Math.abs(delta) >= 420 || prefersReducedMotion) {
      el.scrollTop = target;
      syncElapsedRef.current?.(target);
      return;
    }

    const t0 = performance.now();
    const durationMs = 280;
    const animate = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const nextTop = start + delta * eased;
      el.scrollTop = nextTop;
      syncElapsedRef.current?.(nextTop);
      if (p < 1) {
        easeCancelRef.current = requestAnimationFrame(animate);
      } else {
        easeCancelRef.current = null;
      }
    };
    easeCancelRef.current = requestAnimationFrame(animate);

    return () => {
      if (easeCancelRef.current !== null) {
        cancelAnimationFrame(easeCancelRef.current);
        easeCancelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncCorrection?.nonce]);

  return (
    <div
      ref={scrollRef}
      className={`flex-1 overflow-y-auto overscroll-y-contain px-4 sm:px-6 lg:px-8 pt-3 relative ${bottomPaddingClass}`}
      style={{ fontSize: `${fontSize}%` }}
    >
      {/* Thin GM3 GPU-composited progress bar while auto-scrolling (zero layout reflow / zero React re-renders) */}
      {isAutoScrolling && leadInLeft === 0 && (
        <div
          aria-hidden="true"
          className="gm3-panel-enter sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 -mt-3 mb-4 h-[3px] bg-[var(--secondary-container)]/60 overflow-hidden"
        >
          <div
            ref={progressBarRef}
            data-autoscroll-progress="true"
            className="gm3-autoscroll-bar h-full w-full bg-[var(--accent)]"
            style={{ transform: 'scaleX(0)' }}
          />
        </div>
      )}

      {/* Short-song notice when sheet already fits on screen */}
      {fitsScreenNotice && (
        <div
          role="status"
          aria-live="polite"
          className="gm3-panel-enter sticky top-2 z-20 flex justify-center mb-2 pointer-events-none"
        >
          <span className="studio-chip bg-[var(--surface)] text-[var(--muted)] shadow-sm">
            A música já cabe inteira nesta tela
          </span>
        </div>
      )}

      {/* Lead-in countdown banner */}
      {leadInLeft > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="gm3-panel-enter sticky top-2 z-20 flex justify-center mb-3 pointer-events-none"
        >
          <div
            className="pointer-events-auto flex items-center gap-3 rounded-full bg-[var(--surface)] px-4 py-2 text-xs"
            style={{ boxShadow: 'var(--shadow-md)' }}
          >
            <span className="font-mono font-bold text-[var(--accent-ink)] tabular-nums">
              Rolagem em {leadInLeft}s…
            </span>
            <button
              type="button"
              onClick={() => {
                if (leadInTimerRef.current) {
                  clearInterval(leadInTimerRef.current);
                  leadInTimerRef.current = null;
                }
                setLeadInLeft(0);
              }}
              className="pill-btn pill-btn-tune px-3 h-8 text-xs"
            >
              Iniciar já
            </button>
            <button
              type="button"
              onClick={() => setAutoScrolling(false)}
              className="text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer text-xs px-1.5 py-1"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Subtle manual-scroll yield indicator */}
      {userPausedNotice && isAutoScrolling && leadInLeft === 0 && (
        <div
          role="status"
          aria-live="polite"
          className="gm3-panel-enter sticky top-2 z-20 flex justify-center mb-2 pointer-events-none"
        >
          <span
            className="studio-chip bg-[var(--surface)] text-[var(--muted)]"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            Rolagem manual detectada · retomando daqui…
          </span>
        </div>
      )}

      <div
        ref={contentWrapRef}
        className={`w-full ${
          isSingerMode ? 'font-display' : 'font-sans'
        } ${useTwoColumns ? 'xl:columns-2 xl:gap-5' : ''}`}
      >
        {song.sections.map((section, i) => (
          <SectionBlock
            key={i}
            section={section}
            sectionIdx={i}
            totalSections={song.sections.length}
            onChordTap={onChordTap}
            displayMode={effectiveDisplayMode}
            editMode={editMode}
            selectedCoord={selectedCoord}
            onChordSelect={onChordSelect}
            onAddChord={onAddChord}
            onLinesChange={onLinesChange}
            onRenameSection={onRenameSection}
            onDuplicateSection={onDuplicateSection}
            onMoveSection={onMoveSection}
            onDeleteSection={onDeleteSection}
            calibrationMarkSec={
              calibrating
                ? calibrationMarks?.[i] ?? null
                : song.sectionMarks?.[i] ?? null
            }
            isCalibrationTarget={calibrating && calibrationTargetIdx === i}
            isArrived={!calibrating && !editMode && arrivedSectionIdx === i}
            onCalibrationTap={calibrating ? onCalibrationTap : undefined}
          />
        ))}

        {/* Add new section bar in visual edit mode */}
        {editMode && onAddSection && (
          <div className="mt-4 mb-6 rounded-[24px] border border-dashed border-[var(--line-subtle)] bg-[var(--surface)] p-5 space-y-2.5">
            <div className="field-label">Adicionar nova seção</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SECTION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onAddSection(preset)}
                  className="pill-btn px-3 py-1 text-xs"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
