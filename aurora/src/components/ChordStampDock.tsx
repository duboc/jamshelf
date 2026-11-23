import { getDiatonicChordsForKey } from '@/lib/utils/music';
import { AuroraButton } from '../aurora/primitives';

export interface ChordStampDockProps {
  songChords: string[];
  songKey?: string;
  activeChord: string | null;
  statusAnnouncement?: string;
  onSelectChord: (chord: string) => void;
  onOpenCustomPicker: () => void;
}

/**
 * Floating Aurora bottom dock for the "Acordes" visual edit sub-mode:
 * pick a chord once, then tap words across any section to stamp it in 1 tap
 * with zero mobile keyboard bounce.
 */
export function ChordStampDock({
  songChords,
  songKey,
  activeChord,
  statusAnnouncement = '',
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
      data-chord-stamp-dock="true"
      className="dock-enter-bottom stage-floating-bar fixed bottom-3 md:bottom-4 inset-x-3 md:inset-x-auto md:left-[calc(50%+36px)] md:-translate-x-1/2 md:w-[min(640px,calc(100vw-104px))] z-40 rounded-[24px] px-3.5 py-2.5"
      style={{
        paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div role="status" aria-live="polite" className="sr-only">
        {statusAnnouncement}
      </div>

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          role="status"
          aria-live="polite"
          className="typescale-label-sm text-on-surface-variant truncate"
        >
          {activeChord
            ? `Toque numa palavra para carimbar ${activeChord}`
            : 'Escolha um acorde para carimbar na letra'}
        </span>
        {songChords.length === 0 && songKey && (
          <span className="font-mono typescale-label-sm text-on-surface-variant flex-shrink-0">
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
                data-selected={isActive ? 'true' : undefined}
                onClick={() => onSelectChord(c)}
                className={`stage-chip flex-shrink-0 px-3.5 font-mono typescale-label-sm ${
                  isActive ? 'bg-primary text-on-primary border-primary' : ''
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
        <AuroraButton
          color="tonal"
          icon="add"
          onClick={onOpenCustomPicker}
          title="Escolher ou digitar outro acorde para carimbar"
          className="flex-shrink-0 h-10 min-h-[40px] px-3"
        >
          Outro
        </AuroraButton>
      </div>
    </div>
  );
}
