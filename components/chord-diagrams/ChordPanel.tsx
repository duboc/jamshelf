'use client';

import { useState } from 'react';
import { getGuitarPositions, getPianoNotes } from '@/lib/utils/chord-lookup';
import { GuitarChordDiagram } from './GuitarChordDiagram';
import { PianoChordDiagram } from './PianoChordDiagram';

interface ChordPanelProps {
  chord: string | null;
  onClose: () => void;
}

export function ChordPanel({ chord, onClose }: ChordPanelProps) {
  const [voicingIdx, setVoicingIdx] = useState(0);

  if (!chord) return null;

  const positions = getGuitarPositions(chord);
  const pianoNotes = getPianoNotes(chord);
  const currentVoicing = positions[voicingIdx] || positions[0];

  return (
    <div className="fixed right-0 top-0 bottom-0 w-72 bg-zinc-900/95 backdrop-blur-sm border-l border-zinc-700 z-50 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-700">
        <h3 className="text-lg font-bold text-violet-400 font-display">{chord}</h3>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-700 transition-colors"
        >
          &times;
        </button>
      </div>

      {/* Guitar diagram */}
      <div className="p-4 border-b border-zinc-800">
        <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Guitar</div>
        {currentVoicing ? (
          <>
            <div className="flex justify-center">
              <GuitarChordDiagram voicing={currentVoicing} label={chord} />
            </div>
            {positions.length > 1 && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <button
                  onClick={() => setVoicingIdx((v) => (v - 1 + positions.length) % positions.length)}
                  className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  Prev
                </button>
                <span className="text-xs text-zinc-500">
                  {voicingIdx + 1}/{positions.length}
                </span>
                <button
                  onClick={() => setVoicingIdx((v) => (v + 1) % positions.length)}
                  className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-zinc-500 text-center py-4">No voicing found</div>
        )}
      </div>

      {/* Piano diagram */}
      <div className="p-4">
        <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Piano</div>
        {pianoNotes.length > 0 ? (
          <div className="flex justify-center">
            <PianoChordDiagram notes={pianoNotes} label={chord} />
          </div>
        ) : (
          <div className="text-xs text-zinc-500 text-center py-4">No voicing found</div>
        )}
      </div>
    </div>
  );
}
