import { useEffect, useRef, useState } from 'react';
import { getGuitarPositions, getPianoNotes } from '@/lib/utils/chord-lookup';
import { playReferencePitch } from '@/lib/utils/pitch-audio';
import { AuroraButton, AuroraIconButton, AuroraSheet } from '../aurora/primitives';
import { spellChordNotes } from '../utils/song-display';

const STRING_COUNT = 6;
const FRET_COUNT = 5;
const GW = 152;
const GH = 152;
const PAD_LEFT = 34;
const PAD_RIGHT = 30;
const PAD_TOP = 30;
const FRET_H = (GH - PAD_TOP - 12) / FRET_COUNT;
const STR_GAP = (GW - PAD_LEFT - PAD_RIGHT) / (STRING_COUNT - 1);
const GRID_CENTER_X = PAD_LEFT + (STR_GAP * (STRING_COUNT - 1)) / 2;

export function GuitarDiagram({ chord }: { chord: string }) {
  const voicings = getGuitarPositions(chord);
  const [state, setState] = useState<{ chord: string; idx: number; dir: 'none' | 'next' | 'prev' }>({
    chord,
    idx: 0,
    dir: 'none',
  });
  if (state.chord !== chord) {
    setState({ chord, idx: 0, dir: 'none' });
  }
  const safeIdx = voicings.length ? state.idx % voicings.length : 0;
  const voicing = voicings[safeIdx];

  if (!voicing) {
    return (
      <div className="rounded-2xl bg-surface-container p-4 text-center typescale-body-sm text-on-surface-variant">
        Sem diagrama de violão cadastrado para {chord}.
      </div>
    );
  }

  const { f: frets, b: baseFret, r: barres } = voicing;
  const minFret = baseFret || 1;

  return (
    <div className="rounded-2xl bg-surface-container p-4 flex flex-col items-center gap-2">
      <svg
        viewBox={`0 0 ${GW} ${GH}`}
        role="img"
        aria-label={`Diagrama de violão para o acorde ${chord}`}
        className="w-full max-w-[162px]"
      >
        <text
          x={GRID_CENTER_X}
          y={14}
          textAnchor="middle"
          fill="var(--ui-primary)"
          style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--ui-font-mono)' }}
        >
          {chord}
        </text>

        {Array.from({ length: FRET_COUNT + 1 }).map((_, i) => (
          <line
            key={`f-${i}`}
            x1={PAD_LEFT}
            y1={PAD_TOP + i * FRET_H}
            x2={PAD_LEFT + STR_GAP * 5}
            y2={PAD_TOP + i * FRET_H}
            stroke="var(--ui-outline)"
            strokeOpacity={0.88}
            strokeWidth={1}
          />
        ))}

        {Array.from({ length: STRING_COUNT }).map((_, i) => (
          <line
            key={`s-${i}`}
            x1={PAD_LEFT + i * STR_GAP}
            y1={PAD_TOP}
            x2={PAD_LEFT + i * STR_GAP}
            y2={PAD_TOP + FRET_COUNT * FRET_H}
            stroke="var(--ui-outline)"
            strokeOpacity={0.88}
            strokeWidth={1}
          />
        ))}

        <g
          key={`${chord}-${safeIdx}`}
          data-dir={state.dir === 'none' ? undefined : state.dir}
          className="diagram-settle"
        >
          {minFret === 1 ? (
            <rect
              x={PAD_LEFT - 2}
              y={PAD_TOP - 2}
              width={STR_GAP * 5 + 4}
              height={3.5}
              rx={1.5}
              fill="var(--ui-ink)"
            />
          ) : (
            <text
              x={PAD_LEFT - 10}
              y={PAD_TOP + FRET_H / 2 + 4}
              fill="var(--ui-ink-muted)"
              style={{ fontSize: 11.5, fontFamily: 'var(--ui-font-mono)' }}
              textAnchor="end"
            >
              {minFret}ª
            </text>
          )}

          {barres?.map((barreFret, bi) => {
            const rel = barreFret - minFret;
            const y = PAD_TOP + rel * FRET_H + FRET_H / 2;
            const startStr = frets.indexOf(barreFret);
            const endStr = frets.lastIndexOf(barreFret);
            if (startStr < 0 || endStr < 0 || startStr === endStr) return null;
            return (
              <rect
                key={`b-${bi}`}
                x={PAD_LEFT + startStr * STR_GAP - 4}
                y={y - 5.5}
                width={(endStr - startStr) * STR_GAP + 8}
                height={11}
                rx={5.5}
                fill="var(--ui-primary)"
              />
            );
          })}

          {frets.map((fret, i) => {
            const x = PAD_LEFT + i * STR_GAP;
            if (fret === -1) {
              return (
                <text
                  key={`x-${i}`}
                  x={x}
                  y={PAD_TOP - 7}
                  textAnchor="middle"
                  fill="var(--ui-ink-muted)"
                  style={{ fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--ui-font-mono)' }}
                >
                  ×
                </text>
              );
            }
            if (fret === 0) {
              return (
                <circle
                  key={`o-${i}`}
                  cx={x}
                  cy={PAD_TOP - 10}
                  r={3.5}
                  fill="none"
                  stroke="var(--ui-primary)"
                  strokeWidth={1.5}
                />
              );
            }
            const rel = fret - minFret;
            if (rel < 0 || rel >= FRET_COUNT) return null;
            const y = PAD_TOP + rel * FRET_H + FRET_H / 2;
            return (
              <circle
                key={`d-${i}`}
                cx={x}
                cy={y}
                r={5.5}
                fill="var(--ui-primary)"
              />
            );
          })}
        </g>
      </svg>

      {voicings.length > 1 && (
        <div className="w-full flex items-center justify-between px-1 -mb-2">
          <AuroraIconButton
            icon="chevron_left"
            label="Posição anterior"
            onClick={() =>
              setState((s) => ({
                chord,
                idx: (s.idx - 1 + voicings.length) % voicings.length,
                dir: 'prev',
              }))
            }
          />
          <span className="typescale-body-sm text-on-surface-variant tabular-nums">
            Posição {safeIdx + 1} de {voicings.length}
          </span>
          <AuroraIconButton
            icon="chevron_right"
            label="Próxima posição"
            onClick={() =>
              setState((s) => ({
                chord,
                idx: (s.idx + 1) % voicings.length,
                dir: 'next',
              }))
            }
          />
        </div>
      )}
    </div>
  );
}

const WK_W = 18;
const BK_W = 11;
const BK_H = 42;
const WK_H = 64;
const PW = 14 * WK_W + 20;
const PH = WK_H + 24;

const WHITE_KEYS = [
  { pitch: 0 }, { pitch: 2 }, { pitch: 4 }, { pitch: 5 }, { pitch: 7 }, { pitch: 9 }, { pitch: 11 },
  { pitch: 12 }, { pitch: 14 }, { pitch: 16 }, { pitch: 17 }, { pitch: 19 }, { pitch: 21 }, { pitch: 23 },
];

const BLACK_KEYS = [
  { pitch: 1, x: WK_W * 1 - BK_W / 2 - 1 },
  { pitch: 3, x: WK_W * 2 - BK_W / 2 },
  { pitch: 6, x: WK_W * 4 - BK_W / 2 - 1 },
  { pitch: 8, x: WK_W * 5 - BK_W / 2 },
  { pitch: 10, x: WK_W * 6 - BK_W / 2 },
  { pitch: 13, x: WK_W * 8 - BK_W / 2 - 1 },
  { pitch: 15, x: WK_W * 9 - BK_W / 2 },
  { pitch: 18, x: WK_W * 11 - BK_W / 2 - 1 },
  { pitch: 20, x: WK_W * 12 - BK_W / 2 },
  { pitch: 22, x: WK_W * 13 - BK_W / 2 },
];

function getPitchClass(note: string): number {
  const flatMap: Record<string, string> = {
    Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#',
  };
  const norm = flatMap[note] || note;
  return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(norm);
}

export function PianoDiagram({ chord }: { chord: string }) {
  const rawNotes = getPianoNotes(chord);
  if (rawNotes.length === 0) {
    return (
      <div className="rounded-2xl bg-surface-container p-4 text-center typescale-body-sm text-on-surface-variant">
        Sem mapeamento de teclado para {chord}.
      </div>
    );
  }

  const displayNotes = spellChordNotes(chord, rawNotes);
  const activePitches = new Set<number>();
  let rootPitch: number | null = null;
  let prev = -1;
  rawNotes.forEach((n, idx) => {
    const pc = getPitchClass(n);
    if (pc < 0) return;
    let p = pc;
    while (p <= prev) p += 12;
    activePitches.add(p);
    if (idx === 0) rootPitch = p;
    prev = p;
  });

  return (
    <div className="rounded-2xl bg-surface-container p-4 flex flex-col items-center gap-2">
      <svg
        viewBox={`0 0 ${PW} ${PH}`}
        role="img"
        aria-label={`Notas no teclado para o acorde ${chord}`}
        className="w-full max-w-[260px]"
      >
        <g transform="translate(10, 12)">
          {WHITE_KEYS.map((k, i) => {
            const active = activePitches.has(k.pitch);
            return (
              <g key={`wk-${i}`}>
                <rect
                  x={i * WK_W}
                  y={0}
                  width={WK_W - 1}
                  height={WK_H}
                  rx={2}
                  fill={active ? 'var(--ui-primary)' : 'var(--ui-key-white)'}
                  stroke="var(--ui-outline-subtle)"
                  strokeWidth={0.8}
                  className="piano-key"
                />
                {k.pitch === rootPitch && (
                  <circle
                    key={`root-w-${chord}`}
                    cx={i * WK_W + (WK_W - 1) / 2}
                    cy={WK_H - 9}
                    r={3.2}
                    fill="var(--ui-on-primary)"
                    className="icon-pop-in"
                  />
                )}
              </g>
            );
          })}
          {BLACK_KEYS.map((k, i) => {
            const active = activePitches.has(k.pitch);
            return (
              <g key={`bk-${i}`}>
                <rect
                  x={k.x}
                  y={0}
                  width={BK_W}
                  height={BK_H}
                  rx={1.5}
                  fill={active ? 'var(--ui-primary)' : 'var(--ui-key-black)'}
                  stroke={active ? 'var(--ui-surface-card)' : 'var(--ui-outline-subtle)'}
                  strokeWidth={active ? 1.1 : 0.6}
                  className="piano-key"
                />
                {k.pitch === rootPitch && (
                  <circle
                    key={`root-b-${chord}`}
                    cx={k.x + BK_W / 2}
                    cy={BK_H - 7}
                    r={2.4}
                    fill="var(--ui-on-primary)"
                    className="icon-pop-in"
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="typescale-body-sm text-on-surface-variant font-mono">
        Notas: {displayNotes.join(' · ')}
      </div>
    </div>
  );
}

export function ChordInspectorContent({ chord }: { chord: string }) {
  const [playingMode, setPlayingMode] = useState<'chord' | 'root' | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const triggerPitch = (mode: 'chord' | 'root', durationSec: number) => {
    playReferencePitch(chord, { mode, durationSec });
    setPlayingMode(mode);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setPlayingMode(null), Math.round(durationSec * 1000));
  };

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 gap-2">
        <AuroraButton
          color={playingMode === 'chord' ? 'primary-tonal' : 'tonal'}
          icon="volume_up"
          iconFilled={playingMode === 'chord'}
          aria-pressed={playingMode === 'chord'}
          onClick={() => triggerPitch('chord', 1.8)}
          className="px-3 w-full"
        >
          Ouvir acorde
        </AuroraButton>
        <AuroraButton
          color={playingMode === 'root' ? 'primary-tonal' : 'outlined'}
          icon="music_note"
          iconFilled={playingMode === 'root'}
          aria-pressed={playingMode === 'root'}
          onClick={() => triggerPitch('root', 1.4)}
          className="px-3 w-full"
        >
          Nota tônica
        </AuroraButton>
      </div>
      <GuitarDiagram chord={chord} />
      <PianoDiagram chord={chord} />
    </div>
  );
}

export function ChordInspectorSheet({
  chord,
  onClose,
}: {
  chord: string | null;
  onClose: () => void;
}) {
  return (
    <AuroraSheet
      open={Boolean(chord)}
      onClose={onClose}
      title={chord ? `Acorde ${chord}` : 'Acorde'}
      subtitle="Referência de violão, teclado e som guia"
    >
      {chord && <ChordInspectorContent chord={chord} />}
    </AuroraSheet>
  );
}
