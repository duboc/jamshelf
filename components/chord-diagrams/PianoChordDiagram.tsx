'use client';

const WHITE_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_KEYS_MAP: Record<string, number> = {
  'C#': 0, 'D#': 1, 'F#': 3, 'G#': 4, 'A#': 5,
};
const W = 182;
const H = 80;
const WK_W = 22;
const BK_W = 14;
const BK_H = 48;
const WK_H = 72;

export function PianoChordDiagram({ notes, label }: { notes: string[]; label: string }) {
  const noteSet = new Set(notes);

  const blackKeyPositions = [
    { note: 'C#', x: WK_W * 1 - BK_W / 2 - 2 },
    { note: 'D#', x: WK_W * 2 - BK_W / 2 - 1 },
    { note: 'F#', x: WK_W * 4 - BK_W / 2 - 2 },
    { note: 'G#', x: WK_W * 5 - BK_W / 2 - 1 },
    { note: 'A#', x: WK_W * 6 - BK_W / 2 },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full max-w-[200px]">
      <text x={W / 2} y={12} textAnchor="middle" className="fill-violet-400 text-[10px] font-bold">
        {label}
      </text>
      <g transform="translate(10, 16)">
        {/* White keys */}
        {WHITE_KEYS.map((note, i) => {
          const active = noteSet.has(note);
          return (
            <rect
              key={`wk-${note}`}
              x={i * WK_W}
              y={0}
              width={WK_W - 2}
              height={WK_H}
              rx={2}
              className={active ? 'fill-violet-400' : 'fill-zinc-200'}
              stroke="#555"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Black keys */}
        {blackKeyPositions.map(({ note, x }) => {
          const active = noteSet.has(note);
          return (
            <rect
              key={`bk-${note}`}
              x={x}
              y={0}
              width={BK_W}
              height={BK_H}
              rx={2}
              className={active ? 'fill-violet-500' : 'fill-zinc-800'}
              stroke="#333"
              strokeWidth={0.5}
            />
          );
        })}
      </g>
    </svg>
  );
}
