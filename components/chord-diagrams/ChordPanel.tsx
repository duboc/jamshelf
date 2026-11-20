'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getGuitarPositions, getPianoNotes } from '@/lib/utils/chord-lookup';
import { playReferencePitch } from '@/lib/utils/pitch-audio';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';
import { useAnimatedPresence, useRetainedValue } from '@/lib/hooks/use-animated-presence';
import { CloseIcon, PitchWaveIcon } from '@/components/ui/Icons';
import { GuitarChordDiagram } from './GuitarChordDiagram';
import { PianoChordDiagram } from './PianoChordDiagram';

interface ChordPanelProps {
  chord: string | null;
  onClose: () => void;
}

const subscribeMobileModal = (cb: () => void) => {
  const mql = window.matchMedia('(max-width: 639px)');
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
};
const getMobileModal = () => window.matchMedia('(max-width: 639px)').matches;
const getServerMobileModal = () => false;

function ChordDiagramsBody({ chord }: { chord: string }) {
  const [voicingIdx, setVoicingIdx] = useState(0);

  const positions = getGuitarPositions(chord);
  const pianoNotes = getPianoNotes(chord);
  const safeIdx = positions.length ? voicingIdx % positions.length : 0;
  const currentVoicing = positions[safeIdx] || positions[0];

  return (
    <div className="gm3-view-enter flex-1 overflow-y-auto">
      <div className="p-5 border-b border-[var(--line-subtle)]/40">
        <div className="field-label mb-3">Violão / Guitarra</div>
        {currentVoicing ? (
          <>
            <div key={`g-${safeIdx}`} className="gm3-view-enter flex justify-center">
              <GuitarChordDiagram voicing={currentVoicing} label={chord} />
            </div>
            {positions.length > 1 && (
              <div className="gm3-btn-group justify-center w-full mt-3">
                <button
                  type="button"
                  onClick={() => setVoicingIdx((v) => (v - 1 + positions.length) % positions.length)}
                  className="pill-btn bg-[var(--bg)] px-3 h-8 text-xs"
                >
                  Anterior
                </button>
                <span className="font-mono text-xs text-[var(--muted)] tabular-nums px-1">
                  {safeIdx + 1}/{positions.length}
                </span>
                <button
                  type="button"
                  onClick={() => setVoicingIdx((v) => (v + 1) % positions.length)}
                  className="pill-btn bg-[var(--bg)] px-3 h-8 text-xs"
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-[var(--muted)] text-center py-4">
            Sem diagrama disponível
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="field-label mb-3">Teclado / Piano</div>
        {pianoNotes.length > 0 ? (
          <div className="flex justify-center">
            <PianoChordDiagram notes={pianoNotes} label={chord} />
          </div>
        ) : (
          <div className="text-xs text-[var(--muted)] text-center py-4">
            Sem diagrama disponível
          </div>
        )}
      </div>
    </div>
  );
}

export function ChordPanel({ chord, onClose }: ChordPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const [ringing, setRinging] = useState(false);
  const isOpen = Boolean(chord);
  const { mounted, closing } = useAnimatedPresence(isOpen, 260);
  const displayChord = useRetainedValue(chord);
  const isMobileModal = useSyncExternalStore(
    subscribeMobileModal,
    getMobileModal,
    getServerMobileModal
  );

  // Full modal focus-trap only on mobile (< 640px) where the drawer covers the screen.
  // On desktop/tablet (>= 640px) behave as a non-modal side region so musicians can keep navigating and tapping chords.
  useDialogA11y(isOpen && isMobileModal, onClose, panelRef);

  useEffect(() => {
    if (!isOpen || isMobileModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, isMobileModal, onClose]);

  if (!mounted || !displayChord) return null;

  const handlePlay = () => {
    if (playReferencePitch(displayChord, { mode: 'chord' })) {
      setRinging(true);
      setTimeout(() => setRinging(false), 1400);
    }
  };

  return (
    <>
      {/* Modal tap-to-dismiss backdrop on mobile; non-blocking side sheet on sm+ */}
      {isMobileModal && (
        <div
          className={`${closing ? 'gm3-backdrop-exit' : 'gm3-backdrop-enter'} fixed inset-0 z-40 bg-black/25`}
          onClick={closing ? undefined : onClose}
          aria-hidden="true"
        />
      )}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal={isMobileModal || undefined}
        aria-labelledby="chord-panel-title"
        inert={closing || undefined}
        className={`gm3-card ${closing ? 'gm3-drawer-right-exit' : 'gm3-drawer-right'} fixed right-0 top-0 bottom-0 w-72 max-w-[85vw] rounded-l-[28px] bg-[var(--surface)] z-50 flex flex-col overflow-hidden`}
        style={{ boxShadow: 'var(--shadow-md)' }}
      >
        <div className="sr-only" role="status" aria-live="polite">
          Diagrama do acorde {displayChord}
        </div>

        {/* Header stays mounted across chord switches so focus inside Ouvir/Fechar is never dropped */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line-subtle)]/40 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2
              id="chord-panel-title"
              className="text-2xl font-display font-bold text-[var(--accent-ink)] leading-tight"
            >
              {displayChord}
            </h2>
            <button
              type="button"
              onClick={handlePlay}
              className={`pill-btn px-2.5 h-8 text-xs ${
                ringing ? 'pill-btn-primary' : 'bg-[var(--bg)] text-[var(--accent-ink)]'
              }`}
              title="Ouvir referência sonora deste acorde"
            >
              <PitchWaveIcon size={14} className={ringing ? 'gm3-wave-ringing' : undefined} />
              Ouvir
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="gm3-icon-btn w-9 h-9 flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer"
            aria-label="Fechar painel de acorde"
          >
            <CloseIcon size={17} />
          </button>
        </div>

        <ChordDiagramsBody key={displayChord} chord={displayChord} />
      </aside>
    </>
  );
}
