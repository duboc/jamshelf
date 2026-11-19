'use client';

import { usePlayerStore } from '@/lib/stores/player-store';
import { getGuitarPositions } from '@/lib/utils/chord-lookup';
import { GuitarChordDiagram } from './GuitarChordDiagram';

interface ChordsReferenceProps {
  chords: string[];
}

export function ChordsReference({ chords }: ChordsReferenceProps) {
  const store = usePlayerStore();

  if (!chords || chords.length === 0) return null;

  return (
    <div className="flex-shrink-0 border-b border-[var(--line)] bg-[var(--surface)] px-4 sm:px-6 py-3">
      <div className="max-w-6xl mx-auto">
        <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
          {chords.map((chord) => {
            const positions = getGuitarPositions(chord);
            const currentVoicing = positions[0];
            if (!currentVoicing) return null;

            const isActive = store.activeChord === chord;

            return (
              <button
                key={chord}
                type="button"
                onClick={() => store.setActiveChord(chord)}
                className={`flex-shrink-0 rounded-lg border p-2 flex flex-col items-center justify-center min-w-[86px] transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[var(--nav-active-bg)] border-[var(--accent)]'
                    : 'bg-[var(--surface)] border-[var(--line)] hover:border-[var(--muted)]'
                }`}
              >
                <div className="w-16 h-[74px] flex items-center justify-center">
                  <GuitarChordDiagram voicing={currentVoicing} label={chord} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
