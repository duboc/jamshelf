import { useEffect, useRef, useState } from 'react';
import type { ParsedSong } from '@/lib/types/song';
import { useDisplayStore } from '@/lib/stores/display-store';
import { formatDuration, parseDurationValue } from '@/lib/utils/chordpro-parser';
import { isMinorKey } from '@/lib/utils/music';
import { AuroraButton, AuroraSegmented, UiIcon } from '../aurora/primitives';

const KEY_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export interface SongMetaPopoverProps {
  song: ParsedSong;
  displayedKey: string;
  onPatchMeta: (key: string, value: string | number) => void;
  editMode?: boolean;
  hideKey?: boolean;
}

/**
 * Compact musical metadata trigger ("85 BPM · 4/4 · 4:32") and Aurora popover
 * for editing original key, capo, BPM (with Tap Tempo & hold-repeat), time signature, and duration.
 */
export function SongMetaPopover({
  song,
  displayedKey,
  onPatchMeta,
  editMode = false,
  hideKey = false,
}: SongMetaPopoverProps) {
  const { capoDisplay, setCapoDisplay } = useDisplayStore();
  const [open, setOpen] = useState(false);
  const [bpmDraft, setBpmDraft] = useState(String(song.tempo));
  const [bpmHint, setBpmHint] = useState('');
  const [keyQuality, setKeyQuality] = useState<'major' | 'minor'>(
    isMinorKey(song.originalKey) ? 'minor' : 'major'
  );
  const [durationDraft, setDurationDraft] = useState(
    song.duration ? formatDuration(song.duration) : ''
  );
  const [durationHint, setDurationHint] = useState('');

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tapTimesRef = useRef<number[]>([]);
  const holdTimeoutRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const pointerHandledRef = useRef(false);
  const bpmLiveRef = useRef(song.tempo);
  const onPatchMetaRef = useRef(onPatchMeta);
  bpmLiveRef.current = song.tempo;
  onPatchMetaRef.current = onPatchMeta;

  const stopHold = () => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  useEffect(() => stopHold, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const stepBpm = (delta: number) => {
    const next = Math.max(40, Math.min(240, bpmLiveRef.current + delta));
    bpmLiveRef.current = next;
    setBpmDraft(String(next));
    setBpmHint('');
    onPatchMetaRef.current('tempo', next);
  };

  const startHold = (delta: number) => {
    stopHold();
    stepBpm(delta);
    holdTimeoutRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => stepBpm(delta), 75);
    }, 300);
  };

  const handleTapTempo = () => {
    const now = Date.now();
    const prev = tapTimesRef.current;
    const recent =
      prev.length && now - prev[prev.length - 1] > 2000 ? [now] : [...prev.slice(-4), now];
    tapTimesRef.current = recent;
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
      setBpmHint('Continue batendo no pulso...');
    }
  };

  const commitBpm = () => {
    const parsed = parseInt(bpmDraft.trim(), 10);
    if (Number.isNaN(parsed)) {
      setBpmDraft(String(song.tempo));
      setBpmHint('Use um número entre 40 e 240');
      return;
    }
    const clamped = Math.max(40, Math.min(240, parsed));
    setBpmDraft(String(clamped));
    setBpmHint(clamped !== parsed ? 'Ajustado para 40 a 240 BPM' : '');
    if (clamped !== song.tempo) onPatchMeta('tempo', clamped);
  };

  const commitDuration = () => {
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

  return (
    <div ref={wrapRef} className={`relative inline-flex items-center ${open ? 'z-40' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setBpmDraft(String(song.tempo));
          setBpmHint('');
          setKeyQuality(isMinorKey(song.originalKey) ? 'minor' : 'major');
          setDurationDraft(song.duration ? formatDuration(song.duration) : '');
          setDurationHint('');
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Ajustar tom original, capo, andamento (BPM), compasso e duração"
        className={`inline-flex items-center gap-1.5 min-h-[40px] rounded-full cursor-pointer transition-colors ${
          editMode
            ? 'bg-surface border border-outline-variant hover:bg-surface-container-high px-3'
            : 'bg-transparent hover:bg-surface-container-high px-2'
        }`}
      >
        {!hideKey && displayedKey && (
          <span
            className={`px-2 py-0.5 rounded-full font-mono typescale-label-sm ${
              minorKey
                ? 'bg-minor-bg text-minor-ink'
                : 'bg-primary-container text-on-primary-container'
            }`}
          >
            {displayedKey}
          </span>
        )}
        {song.capo > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container typescale-label-sm font-mono">
            Capo {song.capo}
          </span>
        )}
        <span className="font-mono typescale-body-sm text-on-surface-variant tabular-nums">
          {!song.tempoConfirmed ? '~' : ''}
          {song.tempo} BPM
          <span className={editMode ? 'hidden sm:inline' : ''}>
            {' · '}
            {song.timeSignature}
            {song.duration ? ` · ${formatDuration(song.duration)}` : ''}
          </span>
        </span>
        <UiIcon
          name="expand_more"
          size={20}
          className={`text-on-surface-variant tx-chevron ${open ? 'tx-chevron-open' : ''}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Propriedades musicais da faixa"
          data-origin="top-left"
          className="stage-popover absolute left-0 top-[calc(100%+8px)] z-50 w-[min(336px,calc(100vw-32px))] max-h-[min(78vh,560px)] overflow-y-auto rounded-[24px] bg-surface border border-outline-variant p-4 space-y-3.5 text-left"
          style={{ boxShadow: 'var(--ui-elevation-overlay)' }}
        >
          <div className="typescale-label-sm text-on-surface-variant">Propriedades da música</div>

          <div className="space-y-2" role="group" aria-label="Tom original">
            <div className="flex items-center justify-between gap-2">
              <span className="typescale-label-lg text-on-surface">
                Tom{song.originalKey ? `: ${song.originalKey}` : ''}
              </span>
              <div className="flex items-center gap-1.5">
                <AuroraSegmented<'major' | 'minor'>
                  ariaLabel="Qualidade do tom"
                  value={keyQuality}
                  onChange={(q) => {
                    setKeyQuality(q);
                    if (currentKeyRoot) {
                      onPatchMeta('key', q === 'minor' ? `${currentKeyRoot}m` : currentKeyRoot);
                    }
                  }}
                  options={[
                    { value: 'major', label: 'Maior' },
                    { value: 'minor', label: 'Menor' },
                  ]}
                />
                {song.originalKey && (
                  <button
                    type="button"
                    onClick={() => onPatchMeta('key', '')}
                    className="typescale-label-sm text-on-surface-variant hover:text-on-surface px-1.5 min-h-[36px] cursor-pointer bg-transparent border-none"
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
                    aria-pressed={active}
                    onClick={() => onPatchMeta('key', candidate)}
                    className={`h-10 rounded-xl font-mono typescale-label-sm cursor-pointer border-none transition-colors ${
                      active
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    {candidate}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant/50">
            <span className="typescale-label-lg text-on-surface">Capotraste</span>
            <div className="inline-flex items-center gap-1 rounded-full bg-surface-container p-0.5">
              <button
                type="button"
                aria-label="Diminuir capotraste"
                onClick={() => onPatchMeta('capo', Math.max(0, song.capo - 1))}
                className="dock-stepper-btn"
              >
                <UiIcon name="remove" size={20} />
              </button>
              <span className="font-mono typescale-label-lg text-on-surface w-7 text-center tabular-nums">
                {song.capo}
              </span>
              <button
                type="button"
                aria-label="Aumentar capotraste"
                onClick={() => onPatchMeta('capo', Math.min(12, song.capo + 1))}
                className="dock-stepper-btn"
              >
                <UiIcon name="add" size={20} />
              </button>
            </div>
          </div>

          {song.capo > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="typescale-body-sm text-on-surface-variant">Mostrar acordes</span>
              <AuroraSegmented<'sounding' | 'shapes'>
                ariaLabel="Formato dos acordes com capo"
                value={capoDisplay}
                onChange={setCapoDisplay}
                options={[
                  { value: 'sounding', label: 'Tom real' },
                  { value: 'shapes', label: 'Formas' },
                ]}
              />
            </div>
          )}

          <div className="space-y-1.5 pt-2 border-t border-outline-variant/50">
            <div className="flex items-center justify-between gap-2">
              <div>
                <label htmlFor="meta-bpm-popover" className="typescale-label-lg text-on-surface block">
                  Andamento (BPM)
                </label>
                <span className="typescale-body-sm text-on-surface-variant">40 a 240 BPM</span>
              </div>
              <div className="flex items-center gap-1">
                <AuroraButton color="tonal" onClick={handleTapTempo} className="px-3">
                  Tap
                </AuroraButton>
                <div className="inline-flex items-center rounded-full bg-surface-container p-0.5 focus-within:ring-2 focus-within:ring-primary">
                  <button
                    type="button"
                    aria-label="Diminuir andamento em 1 BPM"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      pointerHandledRef.current = true;
                      startHold(-1);
                    }}
                    onPointerUp={stopHold}
                    onPointerLeave={stopHold}
                    onPointerCancel={() => {
                      pointerHandledRef.current = false;
                      stopHold();
                    }}
                    onClick={() => {
                      if (pointerHandledRef.current) {
                        pointerHandledRef.current = false;
                        return;
                      }
                      stepBpm(-1);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        stepBpm(-1);
                      }
                    }}
                    className="dock-stepper-btn touch-none select-none"
                  >
                    <UiIcon name="remove" size={20} />
                  </button>
                  <input
                    id="meta-bpm-popover"
                    type="number"
                    inputMode="numeric"
                    min={40}
                    max={240}
                    value={bpmDraft}
                    onChange={(e) => {
                      setBpmDraft(e.target.value);
                      setBpmHint('');
                    }}
                    onBlur={commitBpm}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="w-12 bg-transparent border-none text-center font-mono text-base lg:text-sm text-on-surface rounded-lg focus-visible:outline-2 focus-visible:outline-primary tabular-nums"
                  />
                  <button
                    type="button"
                    aria-label="Aumentar andamento em 1 BPM"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      pointerHandledRef.current = true;
                      startHold(1);
                    }}
                    onPointerUp={stopHold}
                    onPointerLeave={stopHold}
                    onPointerCancel={() => {
                      pointerHandledRef.current = false;
                      stopHold();
                    }}
                    onClick={() => {
                      if (pointerHandledRef.current) {
                        pointerHandledRef.current = false;
                        return;
                      }
                      stepBpm(1);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        stepBpm(1);
                      }
                    }}
                    className="dock-stepper-btn touch-none select-none"
                  >
                    <UiIcon name="add" size={20} />
                  </button>
                </div>
              </div>
            </div>
            {bpmHint && (
              <div role="status" className="typescale-body-sm text-warn-ink">
                {bpmHint}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <label htmlFor="meta-time-popover" className="typescale-label-lg text-on-surface">
              Compasso
            </label>
            <select
              id="meta-time-popover"
              value={song.timeSignature}
              onChange={(e) => onPatchMeta('time', e.target.value)}
              className="stage-field w-28 font-mono text-base lg:text-sm py-2"
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
                <label htmlFor="meta-duration-popover" className="typescale-label-lg text-on-surface block">
                  Duração
                </label>
                <span className="typescale-body-sm text-on-surface-variant">Base do auto-scroll (mm:ss)</span>
              </div>
              <input
                id="meta-duration-popover"
                type="text"
                value={durationDraft}
                onChange={(e) => {
                  setDurationDraft(e.target.value);
                  setDurationHint('');
                }}
                onBlur={commitDuration}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                placeholder="3:30"
                className="stage-field w-24 text-center font-mono text-base lg:text-sm py-2"
              />
            </div>
            {durationHint && (
              <div role="status" className="typescale-body-sm text-warn-ink">
                {durationHint}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
