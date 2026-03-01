'use client';

import { parseLine } from '@/lib/utils/music';
import { ChordBadge } from './ChordBadge';

interface ChordLineProps {
  line: string;
  onChordTap: (chord: string) => void;
}

export function ChordLine({ line, onChordTap }: ChordLineProps) {
  const segments = parseLine(line);
  const hasChords = segments.some((s) => s.chord);

  if (!hasChords) {
    return (
      <div className="min-h-[1.4em] whitespace-pre-wrap leading-relaxed">
        {line || '\u00A0'}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end leading-relaxed">
      {segments.map((seg, i) => (
        <span key={i} className="inline-flex flex-col">
          <span className="min-h-[1.4em]">
            {seg.chord ? (
              <ChordBadge chord={seg.chord} onTap={onChordTap} />
            ) : null}
          </span>
          <span className="whitespace-pre-wrap">{seg.text || '\u00A0'}</span>
        </span>
      ))}
    </div>
  );
}
