'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Song } from '@/lib/types/song';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import {
  computeLinearRatePxPerSec,
  estimateSongDurationSec,
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
  onScrollStateChange?: (state: { scrollTop: number; scrollRatio: number }) => void;
  syncCorrection?: { scrollTop: number; scrollRatio: number | null; nonce: number };
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onActiveSectionChange?: (sectionIdx: number) => void;
  bottomPaddingClass?: string;
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
  bottomPaddingClass = 'pb-20',
}: ChordSheetProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const scrollRef = scrollContainerRef ?? internalRef;
  const { isAutoScrolling, autoScrollSpeed, setAutoScrolling } = usePlayerStore();
  const fontSize = useDisplayStore((s) => s.fontSize);
  const scrollLeadInSec = useDisplayStore((s) => s.scrollLeadInSec);

  const [leadInLeft, setLeadInLeft] = useState(0);
  const [userPausedNotice, setUserPausedNotice] = useState(false);

  const speedRef = useRef(autoScrollSpeed);
  useEffect(() => {
    speedRef.current = autoScrollSpeed;
  }, [autoScrollSpeed]);

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
    return tops;
  }, []);

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

  // Core smart auto-scroll loop (calibrated marks OR duration-proportional linear)
  useEffect(() => {
    if (!isAutoScrolling || leadInLeft > 0) return;
    const el = scrollRef.current;
    if (!el) return;

    let frameId: number;
    let last = performance.now();
    let position = el.scrollTop;

    const currentSong = songRef.current;
    const durationSec = estimateSongDurationSec(currentSong);
    const maxScroll0 = Math.max(0, el.scrollHeight - el.clientHeight);
    const sectionTops0 = measureSectionTops(el);
    let elapsedSec = hasUsableMarks(currentSong.sectionMarks, currentSong.sections.length)
      ? scrollTopToMarkedElapsed(position, currentSong.sectionMarks, sectionTops0, maxScroll0, durationSec)
      : 0;

    syncElapsedRef.current = (newTop: number) => {
      position = newTop;
      const s = songRef.current;
      const maxS = Math.max(0, el.scrollHeight - el.clientHeight);
      if (hasUsableMarks(s.sectionMarks, s.sections.length)) {
        elapsedSec = scrollTopToMarkedElapsed(
          newTop,
          s.sectionMarks,
          measureSectionTops(el),
          maxS,
          estimateSongDurationSec(s)
        );
      }
    };

    const step = (now: number) => {
      const dt = Math.min(0.15, Math.max(0, (now - last) / 1000));
      last = now;

      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      if (maxScroll <= 1) {
        frameId = requestAnimationFrame(step);
        return;
      }

      // If user recently scrolled manually, yield and track their new position
      if (now < userPauseUntilRef.current) {
        position = el.scrollTop;
        const s = songRef.current;
        if (hasUsableMarks(s.sectionMarks, s.sections.length)) {
          elapsedSec = scrollTopToMarkedElapsed(
            position,
            s.sectionMarks,
            measureSectionTops(el),
            maxScroll,
            estimateSongDurationSec(s)
          );
        }
        frameId = requestAnimationFrame(step);
        return;
      }

      // Re-sync once immediately after a manual pause ends
      if (userTouchedRef.current) {
        userTouchedRef.current = false;
        position = el.scrollTop;
        const s = songRef.current;
        if (hasUsableMarks(s.sectionMarks, s.sections.length)) {
          elapsedSec = scrollTopToMarkedElapsed(
            position,
            s.sectionMarks,
            measureSectionTops(el),
            maxScroll,
            estimateSongDurationSec(s)
          );
        }
      }

      const s = songRef.current;
      const dur = estimateSongDurationSec(s);

      if (hasUsableMarks(s.sectionMarks, s.sections.length)) {
        elapsedSec += dt * speedRef.current;
        const tops = measureSectionTops(el);
        position = interpolateMarkedScroll(elapsedSec, s.sectionMarks, tops, maxScroll, dur);
      } else {
        const pxPerSec = computeLinearRatePxPerSec(maxScroll, dur, speedRef.current);
        position += pxPerSec * dt;
      }

      if (position >= maxScroll - 0.5) {
        el.scrollTop = maxScroll;
        setAutoScrolling(false);
        return;
      }

      el.scrollTop = position;
      frameId = requestAnimationFrame(step);
    };

    frameId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frameId);
      syncElapsedRef.current = null;
    };
  }, [isAutoScrolling, leadInLeft, scrollRef, measureSectionTops, setAutoScrolling]);

  // Report normalized scroll state for live-session sync + track active visible section
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      const scrollRatio = maxScroll > 0 ? Math.max(0, Math.min(1, el.scrollTop / maxScroll)) : 0;
      onScrollStateChange?.({ scrollTop: el.scrollTop, scrollRatio });

      if (onActiveSectionChange) {
        const nodes = el.querySelectorAll<HTMLElement>('[data-section-idx]');
        let currentIdx = 0;
        const topThreshold = el.scrollTop + 96;
        for (const node of nodes) {
          if (node.offsetTop <= topThreshold) {
            currentIdx = Number(node.dataset.sectionIdx || 0);
          } else {
            break;
          }
        }
        onActiveSectionChange(currentIdx);
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

    // Small drift -> ignore; large jump -> snap; medium drift -> ease smoothly over 280ms
    if (Math.abs(delta) < 4) return;
    if (Math.abs(delta) >= 420) {
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

  const effectiveDisplayMode = editMode ? 'both' : displayMode;
  const isSingerMode = effectiveDisplayMode === 'lyrics-only';

  return (
    <div
      ref={scrollRef}
      className={`flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pt-3 relative ${bottomPaddingClass}`}
      style={{ fontSize: `${fontSize}%` }}
    >
      {/* Lead-in countdown banner */}
      {leadInLeft > 0 && (
        <div className="sticky top-2 z-20 flex justify-center mb-3 pointer-events-none">
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
              className="pill-btn pill-btn-tune px-2.5 h-7 text-xs"
            >
              Iniciar já
            </button>
            <button
              type="button"
              onClick={() => setAutoScrolling(false)}
              className="text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer text-xs"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Subtle manual-scroll yield indicator */}
      {userPausedNotice && isAutoScrolling && leadInLeft === 0 && (
        <div className="sticky top-2 z-20 flex justify-center mb-2 pointer-events-none">
          <span
            className="studio-chip bg-[var(--surface)] text-[var(--muted)]"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            Rolagem manual detectada · retomando daqui…
          </span>
        </div>
      )}

      <div
        className={`w-full ${
          isSingerMode ? 'font-display' : 'font-mono'
        }`}
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
