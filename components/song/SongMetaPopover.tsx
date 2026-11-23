'use client';

import { useEffect, useRef, useState } from 'react';
import type { ParsedSong } from '@/lib/types/song';
import { useDisplayStore } from '@/lib/stores/display-store';
import { useAnimatedPresence } from '@/lib/hooks/use-animated-presence';
import { formatDuration, parseDurationValue } from '@/lib/utils/chordpro-parser';
import { isMinorKey } from '@/lib/utils/music';
import { ConnectedGroup } from '@/components/ui/ConnectedGroup';
import { Gm3FocalBadge } from '@/components/ui/Gm3FocalBadge';
import { ChevronDownIcon } from '@/components/ui/Icons';

const KEY_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

interface SongMetaPopoverProps {
  song: ParsedSong;
  displayedKey: string;
  onPatchMeta: (key: string, value: string | number) => void;
  editMode?: boolean;
  /** Render the single page-level GM3 focal key badge inside the trigger (true in Hero, false in Edit bar). */
  useFocalBadge?: boolean;
  /** Hide the key badge in the trigger when an adjacent inline key stepper already renders it. */
  hideKey?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Compact musical metadata trigger ("Tom D · 158 BPM · 4/4 · 4:11") and popover
 * for editing original key, capo, BPM (with Tap Tempo & hold-repeat), time signature, and duration.
 */
export function SongMetaPopover({
  song,
  displayedKey,
  onPatchMeta,
  editMode = false,
  useFocalBadge = false,
  hideKey = false,
  onOpenChange,
}: SongMetaPopoverProps) {
  const { capoDisplay, setCapoDisplay } = useDisplayStore();
  const [metaOpen, setMetaOpen] = useState(false);
  const [bpmDraft, setBpmDraft] = useState(String(song.tempo));
  const [bpmHint, setBpmHint] = useState('');
  const [keyQuality, setKeyQuality] = useState<'major' | 'minor'>(
    isMinorKey(song.originalKey) ? 'minor' : 'major'
  );
  const [durationDraft, setDurationDraft] = useState(
    song.duration ? formatDuration(song.duration) : ''
  );
  const [durationHint, setDurationHint] = useState('');

  const metaRef = useRef<HTMLDivElement>(null);
  const metaTriggerRef = useRef<HTMLButtonElement>(null);
  const bpmTapTimesRef = useRef<number[]>([]);
  const bpmHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bpmHoldIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bpmLiveRef = useRef(song.tempo);
  const onPatchMetaRef = useRef(onPatchMeta);
  useEffect(() => {
    bpmLiveRef.current = song.tempo;
    onPatchMetaRef.current = onPatchMeta;
  });

  const { mounted: metaMounted, closing: metaClosing } = useAnimatedPresence(metaOpen, 220);

  const stopBpmHold = () => {
    if (bpmHoldTimeoutRef.current) {
      clearTimeout(bpmHoldTimeoutRef.current);
      bpmHoldTimeoutRef.current = null;
    }
    if (bpmHoldIntervalRef.current) {
      clearInterval(bpmHoldIntervalRef.current);
      bpmHoldIntervalRef.current = null;
    }
  };

  useEffect(() => stopBpmHold, []);

  useEffect(() => {
    onOpenChange?.(metaOpen);
  }, [metaOpen, onOpenChange]);

  useEffect(() => {
    if (!metaOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (metaRef.current && !metaRef.current.contains(e.target as Node)) {
        setMetaOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMetaOpen(false);
        metaTriggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [metaOpen]);

  const stepBpm = (delta: number) => {
    const next = Math.max(40, Math.min(240, bpmLiveRef.current + delta));
    bpmLiveRef.current = next;
    setBpmDraft(String(next));
    setBpmHint('');
    onPatchMetaRef.current('tempo', next);
  };

  const startBpmHold = (delta: number) => {
    stopBpmHold();
    stepBpm(delta);
    bpmHoldTimeoutRef.current = setTimeout(() => {
      bpmHoldIntervalRef.current = setInterval(() => stepBpm(delta), 75);
    }, 300);
  };

  const handleMetaTapTempo = () => {
    const now = Date.now();
    const prev = bpmTapTimesRef.current;
    const recent =
      prev.length && now - prev[prev.length - 1] > 2000 ? [now] : [...prev.slice(-4), now];
    bpmTapTimesRef.current = recent;
    if (recent.length >= 2) {
      let sum = 0;
      for (let i = 1; i < recent.length; i++) sum += recent[i] - recent[i - 1];
      const avgMs = sum / (recent.length - 1);
      const tapped = Math.max(40, Math.min(240, Math.round(60000 / avgMs)));
      bpmLiveRef.current = tapped;
      setBpmDraft(String(tapped));
      setBpmHint(`Tap: ${tapped} BPM`);
      onPatchMeta('tempo', tapped);
    } else {
      setBpmHint('Continue batendo no ritmo…');
    }
  };

  const commitBpmDraft = () => {
    const parsed = parseInt(bpmDraft.trim(), 10);
    if (isNaN(parsed)) {
      setBpmDraft(String(song.tempo));
      setBpmHint('Use um número entre 40 e 240');
      return;
    }
    const clamped = Math.max(40, Math.min(240, parsed));
    setBpmDraft(String(clamped));
    setBpmHint(clamped !== parsed ? 'Ajustado para o limite de 40 a 240 BPM' : '');
    if (clamped !== song.tempo) onPatchMeta('tempo', clamped);
  };

  const commitDurationDraft = () => {
    const trimmed = durationDraft.trim();
    if (!trimmed) {
      setDurationHint('');
      return;
    }
    const parsed = parseDurationValue(trimmed);
    if (parsed !== null) {
      onPatchMeta('duration', parsed);
      setDurationDraft(formatDuration(parsed));
      setDurationHint('');
    } else {
      setDurationDraft(song.duration ? formatDuration(song.duration) : '');
      setDurationHint('Formato mm:ss (ex.: 3:30)');
    }
  };

  const currentKeyRoot = song.originalKey
    ? song.originalKey.match(/^([A-G][#b]?)/)?.[1] ?? ''
    : '';
  const minorKey = isMinorKey(displayedKey);
  const keyChipToneClasses = minorKey
    ? 'bg-[var(--minor-container)] text-[var(--on-minor-container)]'
    : 'bg-[var(--primary-container)] text-[var(--on-primary-container)]';

  return (
    <div ref={metaRef} className={`relative inline-flex items-center gap-1.5 flex-wrap ${metaMounted ? 'z-40' : ''}`}>
      <button
        ref={metaTriggerRef}
        type="button"
        onClick={() => {
          setBpmDraft(String(song.tempo));
          setBpmHint('');
          setKeyQuality(isMinorKey(song.originalKey) ? 'minor' : 'major');
          setDurationDraft(song.duration ? formatDuration(song.duration) : '');
          setDurationHint('');
          setMetaOpen((v) => !v);
        }}
        aria-expanded={metaOpen}
        aria-haspopup="dialog"
        className={`pill-btn min-h-[38px] group ${
          editMode
            ? 'bg-[var(--surface)] border border-[var(--line-subtle)]/75 hover:bg-[var(--surface-high)] px-2.5'
            : 'bg-transparent hover:bg-[var(--surface-high)] px-1.5'
        }`}
        title="Ajustar tom, capo, andamento (BPM), compasso e duração"
      >
        {!hideKey && displayedKey && (
          <span className="inline-flex items-center gap-1">
            <span className="text-xs font-medium text-[var(--muted)]">Tom</span>{' '}
            {useFocalBadge ? (
              <Gm3FocalBadge
                size="sm"
                tone={minorKey ? 'minor' : 'primary'}
                vtSongKey={song.id}
                title={`Tom ${displayedKey}`}
              >
                {displayedKey}
              </Gm3FocalBadge>
            ) : (
              <span className={`studio-chip ${keyChipToneClasses} font-semibold px-2.5 py-0.5 text-xs`}>
                {displayedKey}
              </span>
            )}
          </span>
        )}
        {song.capo > 0 && (
          <span className="studio-chip bg-[var(--tune-dim)] text-[var(--tune)]">
            Capo {song.capo}
          </span>
        )}
        <span className="font-mono text-xs text-[var(--muted)] group-hover:text-[var(--ink)] tabular-nums">
          {!song.tempoConfirmed ? '~' : ''}
          {song.tempo} BPM
          <span className={editMode ? 'hidden sm:inline' : ''}>
            {' '}
            · {song.timeSignature}
            {song.duration ? ` · ${formatDuration(song.duration)}` : ''}
          </span>
        </span>
        {editMode && (
          <ChevronDownIcon size={13} className="gm3-chevron text-[var(--muted)] ml-0.5 flex-shrink-0" />
        )}
      </button>

      {metaMounted && (
        <div
          role="dialog"
          aria-label="Ajustes musicais da faixa"
          inert={metaClosing || undefined}
          className={`gm3-popover-top-left ${metaClosing ? 'gm3-popover-exit' : ''} absolute left-0 top-[calc(100%+8px)] z-50 w-[min(320px,calc(100vw-32px))] rounded-[24px] bg-[var(--surface)] p-4 space-y-3`}
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          <div className="field-label">Propriedades da música</div>

          <div className="space-y-2" role="group" aria-label="Tom original">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--ink)]">
                Tom original{song.originalKey ? `: ${song.originalKey}` : ''}
              </span>
              <div className="flex items-center gap-1.5">
                <ConnectedGroup value={keyQuality} ariaLabel="Modo do tom" subtle>
                  <button
                    type="button"
                    aria-pressed={keyQuality === 'major'}
                    onClick={() => {
                      setKeyQuality('major');
                      if (currentKeyRoot) onPatchMeta('key', currentKeyRoot);
                    }}
                    className="gm3-connected-btn inline-flex items-center justify-center px-2.5 h-8 text-xs font-medium cursor-pointer"
                  >
                    Maior
                  </button>
                  <button
                    type="button"
                    aria-pressed={keyQuality === 'minor'}
                    onClick={() => {
                      setKeyQuality('minor');
                      if (currentKeyRoot) onPatchMeta('key', `${currentKeyRoot}m`);
                    }}
                    className="gm3-connected-btn inline-flex items-center justify-center px-2.5 h-8 text-xs font-medium cursor-pointer"
                  >
                    Menor
                  </button>
                </ConnectedGroup>
                {song.originalKey && (
                  <button
                    type="button"
                    onClick={() => onPatchMeta('key', '')}
                    className="text-[11px] font-mono text-[var(--muted)] hover:text-[var(--ink)] px-1 py-1 cursor-pointer"
                    title="Limpar tom"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {KEY_ROOTS.map((root) => {
                const candidate = keyQuality === 'minor' ? `${root}m` : root;
                const active = song.originalKey === candidate;
                return (
                  <button
                    key={root}
                    type="button"
                    data-key-option={candidate}
                    aria-pressed={active}
                    onClick={() => onPatchMeta('key', candidate)}
                    className={`h-9 rounded-xl font-mono text-xs font-bold transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                        : 'bg-[var(--bg)] text-[var(--ink)] hover:bg-[var(--surface-high)]'
                    }`}
                  >
                    {candidate}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--ink)]">Capotraste</span>
            <div className="gm3-btn-group">
              <button
                type="button"
                onClick={() => onPatchMeta('capo', Math.max(0, song.capo - 1))}
                className="pill-btn bg-[var(--bg)] w-10 h-10 lg:w-9 lg:h-9 text-xs font-mono"
                aria-label="Diminuir capotraste"
              >
                -
              </button>
              <span className="font-mono text-xs text-[var(--accent-ink)] w-6 text-center tabular-nums">
                {song.capo}
              </span>
              <button
                type="button"
                onClick={() => onPatchMeta('capo', Math.min(12, song.capo + 1))}
                className="pill-btn bg-[var(--bg)] w-10 h-10 lg:w-9 lg:h-9 text-xs font-mono"
                aria-label="Aumentar capotraste"
              >
                +
              </button>
            </div>
          </div>

          {song.capo > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--muted)]">Mostrar acordes como</span>
              <ConnectedGroup
                value={capoDisplay}
                ariaLabel="Formato de exibição dos acordes com capo"
                subtle
              >
                <button
                  type="button"
                  aria-pressed={capoDisplay === 'sounding'}
                  onClick={() => setCapoDisplay('sounding')}
                  className="gm3-connected-btn min-h-[36px] px-3 py-1 text-xs font-medium cursor-pointer"
                >
                  Tom real
                </button>
                <button
                  type="button"
                  aria-pressed={capoDisplay === 'shapes'}
                  onClick={() => setCapoDisplay('shapes')}
                  className="gm3-connected-btn min-h-[36px] px-3 py-1 text-xs font-medium cursor-pointer"
                >
                  Formas
                </button>
              </ConnectedGroup>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div>
                <label htmlFor="meta-bpm-input" className="text-xs font-semibold text-[var(--ink)] block">
                  Andamento (BPM)
                </label>
                <span className="text-xs text-[var(--muted)]">40 a 240 BPM</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleMetaTapTempo}
                  className="pill-btn pill-btn-tonal px-2.5 h-10 lg:h-9 text-xs font-mono font-semibold"
                  title="Toque no pulso da música para detectar o BPM automaticamente"
                >
                  Tap
                </button>
                <div className="gm3-btn-group">
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      startBpmHold(-1);
                    }}
                    onPointerUp={stopBpmHold}
                    onPointerLeave={stopBpmHold}
                    onPointerCancel={stopBpmHold}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        stepBpm(-1);
                      }
                    }}
                    className="pill-btn bg-[var(--bg)] w-10 h-10 lg:w-9 lg:h-9 text-xs font-mono touch-none select-none"
                    aria-label="Diminuir andamento em 1 BPM"
                    title="Diminuir BPM (segure para ajustar rápido)"
                  >
                    -
                  </button>
                  <input
                    id="meta-bpm-input"
                    type="number"
                    min={40}
                    max={240}
                    value={bpmDraft}
                    onChange={(e) => {
                      setBpmDraft(e.target.value);
                      setBpmHint('');
                    }}
                    onBlur={commitBpmDraft}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="studio-input w-14 text-center text-base lg:text-xs font-mono py-1.5 min-h-[40px] lg:min-h-[34px]"
                  />
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      startBpmHold(1);
                    }}
                    onPointerUp={stopBpmHold}
                    onPointerLeave={stopBpmHold}
                    onPointerCancel={stopBpmHold}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        stepBpm(1);
                      }
                    }}
                    className="pill-btn bg-[var(--bg)] w-10 h-10 lg:w-9 lg:h-9 text-xs font-mono touch-none select-none"
                    aria-label="Aumentar andamento em 1 BPM"
                    title="Aumentar BPM (segure para ajustar rápido)"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            {bpmHint && (
              <div className="text-xs text-[var(--warn-ink)]" role="status">
                {bpmHint}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="meta-time-select" className="text-xs font-semibold text-[var(--ink)]">
              Compasso
            </label>
            <select
              id="meta-time-select"
              value={song.timeSignature}
              onChange={(e) => onPatchMeta('time', e.target.value)}
              className="studio-input px-2.5 py-1.5 min-h-[40px] lg:min-h-[34px] text-base lg:text-xs font-mono"
            >
              <option value="4/4">4/4</option>
              <option value="3/4">3/4</option>
              <option value="6/8">6/8</option>
              <option value="2/4">2/4</option>
              <option value="5/4">5/4</option>
              <option value="7/8">7/8</option>
            </select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div>
                <label htmlFor="meta-duration-input" className="text-xs font-semibold text-[var(--ink)] block">
                  Duração
                </label>
                <div className="text-xs text-[var(--muted)]">Base do auto-scroll (mm:ss)</div>
              </div>
              <input
                id="meta-duration-input"
                type="text"
                value={durationDraft}
                onChange={(e) => {
                  setDurationDraft(e.target.value);
                  setDurationHint('');
                }}
                onBlur={commitDurationDraft}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                placeholder="3:30"
                className="studio-input w-20 text-center text-base lg:text-xs font-mono py-1.5 min-h-[40px] lg:min-h-[34px]"
              />
            </div>
            {durationHint && (
              <div className="text-xs text-[var(--warn-ink)]" role="status">
                {durationHint}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
