'use client';

import type { GuitarVoicing } from '@/lib/types/chord';

interface GuitarChordDiagramProps {
  voicing: GuitarVoicing;
  label: string;
}

const STRING_COUNT = 6;
const FRET_COUNT = 5;
const W = 120;
const H = 140;
const PAD_LEFT = 30;
const PAD_TOP = 25;
const FRET_H = (H - PAD_TOP - 10) / FRET_COUNT;
const STR_GAP = (W - PAD_LEFT - 10) / (STRING_COUNT - 1);

export function GuitarChordDiagram({ voicing, label }: GuitarChordDiagramProps) {
  const { f: frets, b: baseFret, r: barres } = voicing;
  const minFret = baseFret || 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Diagrama de violão para o acorde ${label}`}
      className="w-full max-w-[140px]"
    >
      <text
        x={W / 2}
        y={12}
        textAnchor="middle"
        fill="var(--accent-ink)"
        className="text-[10px] font-bold font-mono"
      >
        {label}
      </text>

      {/* Nut or fret number */}
      {minFret === 1 ? (
        <rect
          x={PAD_LEFT - 2}
          y={PAD_TOP - 2}
          width={STR_GAP * 5 + 4}
          height={3}
          rx={1}
          fill="var(--ink)"
        />
      ) : (
        <text
          x={PAD_LEFT - 12}
          y={PAD_TOP + FRET_H / 2 + 4}
          fill="var(--muted)"
          className="text-[9px] font-mono"
          textAnchor="middle"
        >
          {minFret}
        </text>
      )}

      {/* Fret lines */}
      {Array.from({ length: FRET_COUNT + 1 }).map((_, i) => (
        <line
          key={`fret-${i}`}
          x1={PAD_LEFT}
          y1={PAD_TOP + i * FRET_H}
          x2={PAD_LEFT + STR_GAP * 5}
          y2={PAD_TOP + i * FRET_H}
          stroke="var(--line)"
          strokeWidth={0.9}
        />
      ))}

      {/* String lines */}
      {Array.from({ length: STRING_COUNT }).map((_, i) => (
        <line
          key={`str-${i}`}
          x1={PAD_LEFT + i * STR_GAP}
          y1={PAD_TOP}
          x2={PAD_LEFT + i * STR_GAP}
          y2={PAD_TOP + FRET_COUNT * FRET_H}
          stroke="var(--line)"
          strokeWidth={0.9}
        />
      ))}

      {/* Barre indicators */}
      {barres?.map((barreFret, bi) => {
        const bFretRel = barreFret - minFret;
        const y = PAD_TOP + bFretRel * FRET_H + FRET_H / 2;
        const startStr = frets.indexOf(barreFret);
        const endStr = frets.lastIndexOf(barreFret);
        if (startStr < 0 || endStr < 0 || startStr === endStr) return null;
        return (
          <rect
            key={`barre-${bi}`}
            x={PAD_LEFT + startStr * STR_GAP - 3}
            y={y - 5}
            width={(endStr - startStr) * STR_GAP + 6}
            height={10}
            rx={5}
            fill="var(--accent)"
          />
        );
      })}

      {/* Finger dots + muted/open markers */}
      {frets.map((fret, i) => {
        const x = PAD_LEFT + i * STR_GAP;
        if (fret === -1) {
          return (
            <text
              key={`m-${i}`}
              x={x}
              y={PAD_TOP - 6}
              textAnchor="middle"
              fill="var(--muted)"
              className="text-[9px] font-bold font-mono"
            >
              x
            </text>
          );
        }
        if (fret === 0) {
          return (
            <circle
              key={`o-${i}`}
              cx={x}
              cy={PAD_TOP - 6}
              r={3}
              fill="none"
              stroke="var(--tune)"
              strokeWidth={1.2}
            />
          );
        }
        const fretRel = fret - minFret;
        const y = PAD_TOP + fretRel * FRET_H + FRET_H / 2;
        return (
          <circle key={`d-${i}`} cx={x} cy={y} r={5} fill="var(--ink)" />
        );
      })}
    </svg>
  );
}
