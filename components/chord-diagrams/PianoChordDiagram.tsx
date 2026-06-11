'use client';

const WK_W = 18;
const BK_W = 11;
const BK_H = 42;
const WK_H = 64;
const W = 14 * WK_W + 20; // 272
const H = WK_H + 20;      // 84

const WHITE_KEYS = [
  { note: 'C', pitch: 0 },
  { note: 'D', pitch: 2 },
  { note: 'E', pitch: 4 },
  { note: 'F', pitch: 5 },
  { note: 'G', pitch: 7 },
  { note: 'A', pitch: 9 },
  { note: 'B', pitch: 11 },
  { note: 'C', pitch: 12 },
  { note: 'D', pitch: 14 },
  { note: 'E', pitch: 16 },
  { note: 'F', pitch: 17 },
  { note: 'G', pitch: 19 },
  { note: 'A', pitch: 21 },
  { note: 'B', pitch: 23 },
];

const BLACK_KEYS = [
  { note: 'C#', pitch: 1, x: WK_W * 1 - BK_W / 2 - 1 },
  { note: 'D#', pitch: 3, x: WK_W * 2 - BK_W / 2 },
  { note: 'F#', pitch: 6, x: WK_W * 4 - BK_W / 2 - 1 },
  { note: 'G#', pitch: 8, x: WK_W * 5 - BK_W / 2 },
  { note: 'A#', pitch: 10, x: WK_W * 6 - BK_W / 2 },
  { note: 'C#', pitch: 13, x: WK_W * 8 - BK_W / 2 - 1 },
  { note: 'D#', pitch: 15, x: WK_W * 9 - BK_W / 2 },
  { note: 'F#', pitch: 18, x: WK_W * 11 - BK_W / 2 - 1 },
  { note: 'G#', pitch: 20, x: WK_W * 12 - BK_W / 2 },
  { note: 'A#', pitch: 22, x: WK_W * 13 - BK_W / 2 },
];

function getPitchClass(note: string): number {
  const flatToSharp: Record<string, string> = {
    Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#',
  };
  const normalized = flatToSharp[note] || note;
  const NOTES_LIST = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return NOTES_LIST.indexOf(normalized);
}

export function PianoChordDiagram({ notes, label }: { notes: string[]; label: string }) {
  // Map notes to absolute pitches in ascending order
  const activePitches = new Set<number>();
  let prevPitch = -1;
  notes.forEach((note) => {
    const pc = getPitchClass(note);
    if (pc === -1) return;
    let pitch = pc;
    while (pitch <= prevPitch) {
      pitch += 12;
    }
    activePitches.add(pitch);
    prevPitch = pitch;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[240px]">
      <text x={W / 2} y={12} textAnchor="middle" className="fill-violet-400 text-[10px] font-bold">
        {label}
      </text>
      <g transform="translate(10, 16)">
        {/* White keys */}
        {WHITE_KEYS.map((key, i) => {
          const active = activePitches.has(key.pitch);
          return (
            <rect
              key={`wk-${i}-${key.pitch}`}
              x={i * WK_W}
              y={0}
              width={WK_W - 1}
              height={WK_H}
              rx={1.5}
              fill={active ? '#a78bfa' : '#e4e4e7'}
              stroke="#27272a"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Black keys */}
        {BLACK_KEYS.map((key, i) => {
          const active = activePitches.has(key.pitch);
          return (
            <rect
              key={`bk-${i}-${key.pitch}`}
              x={key.x}
              y={0}
              width={BK_W}
              height={BK_H}
              rx={1}
              fill={active ? '#8b5cf6' : '#18181b'}
              stroke="#27272a"
              strokeWidth={0.5}
            />
          );
        })}
      </g>
    </svg>
  );
}
