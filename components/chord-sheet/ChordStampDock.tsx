'use client';

import { getDiatonicChordsForKey } from '@/lib/utils/music';
import { PlusIcon } from '@/components/ui/Icons';

interface ChordStampDockProps {
  songChords: string[];
  songKey?: string;
  activeChord: string | null;
  onSelectChord: (chord: string) => void;
  onOpenCustomPicker: () => void;
}

/**
 * Slim bottom GM3 dock for "Acordes" sub-mode: pick a chord once, then tap
 * words across any section to stamp it in 1 tap with zero touch-keyboard bounce.
 */
export function ChordStampDock({
  songChords,
  songKey,
  activeChord,
  onSelectChord,
  onOpenCustomPicker,
}: ChordStampDockProps) {
  const baseList = songChords.length > 0 ? songChords : getDiatonicChordsForKey(songKey);
  const chords =
    activeChord && !baseList.includes(activeChord) ? [activeChord, ...baseList] : baseList;

  return (
    <div
      role="region"
      aria-label="Barra rápida de acordes para carimbar"
      className="gm3-sheet-enter fixed bottom-3 md:bottom-4 inset-x-3 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[min(640px,calc(100vw-32px))] z-40 rounded-[24px] bg-[var(--surface-high)] border border-[var(--line-subtle)]/65 px-3.5 py-2.5"
      style={{
        boxShadow: 'var(--shadow-md)',
        paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="field-label truncate">
          {activeChord
            ? `Toque numa palavra para carimbar ${activeChord}`
            : 'Escolha um acorde para carimbar na letra'}
        </span>
        {songChords.length === 0 && songKey && (
          <span className="font-mono text-[11px] text-[var(--muted)] flex-shrink-0">
            Tom {songKey}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {chords.map((c) => {
            const isActive = c === activeChord;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelectChord(c)}
                className={`flex-shrink-0 px-3.5 h-10 rounded-full font-mono text-xs font-bold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                    : 'bg-[var(--surface-control)] text-[var(--ink)] hover:bg-[var(--primary-container)] hover:text-[var(--on-primary-container)]'
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onOpenCustomPicker}
          className="flex-shrink-0 pill-btn pill-btn-tonal px-3 h-10 text-xs font-medium"
          title="Escolher ou digitar outro acorde para carimbar"
        >
          <PlusIcon size={14} />
          Outro
        </button>
      </div>
    </div>
  );
}
