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
    <div className="border-b border-zinc-800 bg-zinc-900/20 px-6 py-4">
      <div className="max-w-5xl mx-auto">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Chords Reference</h3>
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {chords.map((chord) => {
            const positions = getGuitarPositions(chord);
            const currentVoicing = positions[0];
            if (!currentVoicing) return null;

            const isActive = store.activeChord === chord;

            return (
              <button
                key={chord}
                onClick={() => store.setActiveChord(chord)}
                className={`flex-shrink-0 rounded-xl border p-2.5 flex flex-col items-center justify-center min-w-[96px] shadow-sm transition-all cursor-pointer ${
                  isActive
                    ? 'bg-violet-600/20 border-violet-500 ring-2 ring-violet-500/10 scale-105'
                    : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="w-16 h-20 flex items-center justify-center">
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
