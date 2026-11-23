'use client';

import { usePlayerStore } from '@/lib/stores/player-store';
import { ConnectedGroup } from '@/components/ui/ConnectedGroup';
import { CheckIcon, RedoIcon, UndoIcon } from '@/components/ui/Icons';

interface SongToolbarProps {
  editSubMode?: 'text' | 'chords';
  onChangeEditSubMode?: (mode: 'text' | 'chords') => void;
  editingOriginalKey?: string;
  canUndo: boolean;
  canRedo: boolean;
  editDirty: boolean;
  editDiscardArmed: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}

/**
 * Dedicated pinned Visual Edit toolbar (fits 375px phones with zero horizontal scroll).
 * Reading & rehearsal tools now live cleanly in SongHeroStrip + SongAdjustmentsPopover.
 */
export function SongToolbar({
  editSubMode = 'text',
  onChangeEditSubMode,
  editingOriginalKey,
  canUndo,
  canRedo,
  editDirty,
  editDiscardArmed,
  onUndo,
  onRedo,
  onSaveEdit,
  onCancelEdit,
}: SongToolbarProps) {
  const store = usePlayerStore();

  return (
    <div className="flex items-center justify-between flex-nowrap gap-1.5 sm:gap-2 w-full rounded-2xl bg-[var(--surface-high)] px-2.5 sm:px-3.5 py-1.5">
      <div className="flex items-center gap-1.5 flex-nowrap flex-shrink-0">
        {onChangeEditSubMode ? (
          <ConnectedGroup
            value={editSubMode}
            ariaLabel="Ferramenta de edição"
            subtle
            className="hidden sm:inline-flex flex-shrink-0"
          >
            <button
              type="button"
              aria-pressed={editSubMode === 'text'}
              onClick={() => onChangeEditSubMode('text')}
              className="gm3-connected-btn inline-flex items-center justify-center px-3 h-10 lg:h-9 font-display text-xs font-semibold cursor-pointer"
              title="Editar letra, seções e digitar acordes inline [Am7]"
            >
              Texto
            </button>
            <button
              type="button"
              aria-pressed={editSubMode === 'chords'}
              onClick={() => onChangeEditSubMode('chords')}
              className="gm3-connected-btn inline-flex items-center justify-center px-3 h-10 lg:h-9 font-display text-xs font-semibold cursor-pointer"
              title="Carimbar e ajustar acordes em 1 toque (sem abrir teclado)"
            >
              Acordes
            </button>
          </ConnectedGroup>
        ) : (
          <span className="hidden sm:inline-flex studio-chip bg-[var(--secondary-container)] text-[var(--on-secondary-container)] font-semibold">
            Modo edição
          </span>
        )}
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          className="pill-btn w-10 sm:w-auto sm:px-3 h-10 lg:h-9 text-xs"
          title="Desfazer última alteração (Ctrl+Z)"
          aria-label="Desfazer"
        >
          <UndoIcon size={15} />
          <span className="hidden sm:inline">Desfazer</span>
        </button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          className="pill-btn w-10 sm:w-auto sm:px-3 h-10 lg:h-9 text-xs"
          title="Refazer alteração (Ctrl+Y)"
          aria-label="Refazer"
        >
          <RedoIcon size={15} />
          <span className="hidden sm:inline">Refazer</span>
        </button>
        {store.transpose !== 0 && editingOriginalKey && (
          <span
            className="hidden md:inline-flex studio-chip bg-[var(--primary-container)] text-[var(--on-primary-container)] font-mono text-[11px] font-semibold"
            title="Editando sempre no tom original salvo na música"
          >
            Tom original {editingOriginalKey}
          </span>
        )}
        {editDirty && (
          <span
            className="inline-flex items-center gap-1.5 font-mono text-xs text-[var(--muted)]"
            title="Alterações não salvas"
          >
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] flex-shrink-0" aria-hidden="true" />
            <span className="hidden md:inline">Pendente</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={onCancelEdit}
          className={`pill-btn px-3 sm:px-3.5 h-10 lg:h-9 text-xs ${editDiscardArmed ? 'pill-btn-rec' : ''}`}
        >
          {editDiscardArmed ? 'Descartar' : 'Cancelar'}
        </button>
        <button
          type="button"
          onClick={onSaveEdit}
          className="pill-btn pill-btn-primary px-3.5 sm:px-4 h-10 lg:h-9 text-xs"
        >
          <CheckIcon size={14} />
          <span className="sm:hidden">Salvar</span>
          <span className="hidden sm:inline">Salvar e sair</span>
        </button>
      </div>
    </div>
  );
}
