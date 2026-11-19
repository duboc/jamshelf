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
    <div className="gm3-panel-enter flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pb-2.5">
      <div className="w-full rounded-[20px] bg-[var(--surface)] px-3.5 py-3">
        <div className="flex gap-2.5 overflow-x-auto pb-0.5 no-scrollbar">
          {chords.map((chord) => {
            const positions = getGuitarPositions(chord);
            const currentVoicing = positions[0];
            if (!currentVoicing) return null;

            const isActive = store.activeChord === chord;

            return (
              <button
                key={chord}
                type="button"
                aria-pressed={isActive}
                aria-label={`Abrir diagrama ampliado de ${chord}`}
                onClick={() => store.setActiveChord(chord)}
                className={`gm3-chord-tile flex-shrink-0 p-2 flex flex-col items-center justify-center min-w-[86px] cursor-pointer ${
                  isActive
                    ? 'bg-[var(--primary-container)] ring-2 ring-[var(--accent)]'
                    : 'bg-[var(--bg)] hover:bg-[var(--surface-high)]'
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
