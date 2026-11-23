'use client';

import type { ParsedSong, Setlist } from '@/lib/types/song';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { isMinorKey } from '@/lib/utils/music';
import { Gm3FocalBadge } from '@/components/ui/Gm3FocalBadge';
import { SongMetaPopover } from './SongMetaPopover';
import { SectionNav } from './SectionNav';
import { StageNotesBar } from './StageNotesBar';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/Icons';

interface SongHeroStripProps {
  song: ParsedSong;
  displayedKey: string;
  artistInput: string;
  activeSetlist: Setlist | null;
  setlistSongIdx: number;
  totalSetlistSongs: number;
  prevSongId: string | null;
  nextSongId: string | null;
  isFollowing: boolean;
  activeSectionIdx: number;
  onPatchMeta: (key: string, value: string | number) => void;
  onRequestSaveTranspose: () => void;
  onNavigateSong: (songId: string) => void;
  onOpenSetlistDrawer: () => void;
  onJumpToSection: (idx: number) => void;
  onStartEditNotes: () => void;
}

/**
 * Scrollable song metadata, always-ready Tonalidade + Fonte controls, and section jump strip
 * rendered natively inside ChordSheet. Scrolls 1:1 with the finger/wheel at compositor speed:
 * zero header height jumps, zero scroll-back fight.
 */
export function SongHeroStrip({
  song,
  displayedKey,
  artistInput,
  activeSetlist,
  setlistSongIdx,
  totalSetlistSongs,
  prevSongId,
  nextSongId,
  isFollowing,
  activeSectionIdx,
  onPatchMeta,
  onRequestSaveTranspose,
  onNavigateSong,
  onOpenSetlistDrawer,
  onJumpToSection,
  onStartEditNotes,
}: SongHeroStripProps) {
  const store = usePlayerStore();
  const { fontSize, setFontSize } = useDisplayStore();

  const minorKey = isMinorKey(displayedKey);
  const transposeDeltaLabel =
    store.transpose > 0 ? `+${store.transpose}` : store.transpose < 0 ? `${store.transpose}` : '';

  return (
    <div data-song-hero="true" className="space-y-2 pb-1">
      {/* Row 1: Artist + metadata on the left, direct Tonalidade + Fonte controls on the right */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <span className="text-xs sm:text-[13px] text-[var(--muted)] truncate min-w-0 max-w-[220px]">
            {artistInput || 'Artista não informado'}
          </span>

          <SongMetaPopover
            song={song}
            displayedKey={displayedKey}
            onPatchMeta={onPatchMeta}
            hideKey
          />

          {/* Mobile compact setlist stepper (md+ already has it in the pinned top bar) */}
          {activeSetlist && (
            <div className="inline-flex md:hidden gm3-btn-group flex-shrink-0">
              <button
                type="button"
                onClick={() => prevSongId && onNavigateSong(prevSongId)}
                disabled={!prevSongId || isFollowing}
                className="pill-btn w-9 h-9"
                title="Música anterior no setlist"
                aria-label="Música anterior no setlist"
              >
                <ChevronLeftIcon size={15} />
              </button>
              <button
                type="button"
                onClick={onOpenSetlistDrawer}
                className="pill-btn px-2.5 h-9 font-mono text-xs tabular-nums"
                title="Abrir lista do setlist"
              >
                {setlistSongIdx + 1}/{totalSetlistSongs}
              </button>
              <button
                type="button"
                onClick={() => nextSongId && onNavigateSong(nextSongId)}
                disabled={!nextSongId || isFollowing}
                className="pill-btn w-9 h-9"
                title="Próxima música no setlist"
                aria-label="Próxima música no setlist"
              >
                <ChevronRightIcon size={15} />
              </button>
            </div>
          )}
        </div>

        {/* Always-present 1-tap Tonalidade & Fonte controls */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <div
            data-hero-transpose="true"
            role="group"
            aria-label="Ajustar tonalidade"
            className="inline-flex items-center gap-0.5 rounded-full bg-[var(--surface)] p-0.5"
          >
            <button
              type="button"
              onClick={store.transposeDown}
              className="gm3-icon-btn w-9 h-9 rounded-full hover:bg-[var(--surface-high)] text-[var(--ink)] font-mono text-sm font-semibold inline-flex items-center justify-center cursor-pointer"
              aria-label="Baixar meio tom"
              title="Baixar meio tom"
            >
              -
            </button>
            <button
              type="button"
              disabled={store.transpose === 0}
              onClick={() => store.setTranspose(0)}
              className={`inline-flex items-center justify-center rounded-full px-0.5 ${
                store.transpose !== 0 ? 'cursor-pointer' : 'cursor-default'
              }`}
              title={
                store.transpose !== 0
                  ? `Tom ${displayedKey || transposeDeltaLabel} (${transposeDeltaLabel}). Toque para voltar ao original`
                  : displayedKey
                  ? `Tom ${displayedKey}`
                  : 'Tom original'
              }
              aria-label={
                store.transpose !== 0
                  ? `Tom ${displayedKey || transposeDeltaLabel}. Toque para voltar ao original`
                  : `Tom ${displayedKey || 'original'}`
              }
            >
              <Gm3FocalBadge
                size="sm"
                tone={minorKey ? 'minor' : 'primary'}
                vtSongKey={song.id}
              >
                {displayedKey || transposeDeltaLabel || 'Tom'}
              </Gm3FocalBadge>
            </button>
            <button
              type="button"
              onClick={store.transposeUp}
              className="gm3-icon-btn w-9 h-9 rounded-full hover:bg-[var(--surface-high)] text-[var(--ink)] font-mono text-sm font-semibold inline-flex items-center justify-center cursor-pointer"
              aria-label="Subir meio tom"
              title="Subir meio tom"
            >
              +
            </button>
          </div>

          {store.transpose !== 0 && (
            <button
              type="button"
              onClick={onRequestSaveTranspose}
              className="pill-btn bg-[var(--primary-container)] text-[var(--on-primary-container)] px-3 h-9 text-xs font-semibold"
              title="Salvar música permanentemente neste novo tom"
            >
              Salvar tom
            </button>
          )}

          <div
            data-hero-font="true"
            role="group"
            aria-label="Ajustar tamanho da fonte"
            className="inline-flex items-center gap-0.5 rounded-full bg-[var(--surface)] p-0.5"
          >
            <button
              type="button"
              onClick={() => setFontSize(fontSize - 10)}
              className="gm3-icon-btn w-9 h-9 rounded-full hover:bg-[var(--surface-high)] text-[var(--ink)] font-mono text-xs font-semibold inline-flex items-center justify-center cursor-pointer"
              aria-label="Diminuir fonte"
              title="Diminuir fonte"
            >
              A-
            </button>
            <button
              type="button"
              disabled={fontSize === 100}
              onClick={() => setFontSize(100)}
              className={`gm3-icon-btn font-mono text-xs min-w-[42px] h-9 px-1 rounded-full text-center tabular-nums inline-flex items-center justify-center ${
                fontSize !== 100
                  ? 'bg-[var(--primary-container)] text-[var(--on-primary-container)] font-semibold cursor-pointer'
                  : 'text-[var(--muted)] cursor-default'
              }`}
              title={fontSize !== 100 ? 'Toque para voltar a 100%' : 'Tamanho padrão da fonte (100%)'}
              aria-label={`Tamanho da fonte ${fontSize}%`}
            >
              {fontSize}%
            </button>
            <button
              type="button"
              onClick={() => setFontSize(fontSize + 10)}
              className="gm3-icon-btn w-9 h-9 rounded-full hover:bg-[var(--surface-high)] text-[var(--ink)] font-mono text-xs font-semibold inline-flex items-center justify-center cursor-pointer"
              aria-label="Aumentar fonte"
              title="Aumentar fonte"
            >
              A+
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Section jump chips (scroll cleanly with the sheet, zero sticky bloat) */}
      {song.sections.length > 1 && (
        <div className="-mx-4 sm:-mx-6 lg:-mx-8">
          <SectionNav
            sections={song.sections}
            activeIdx={activeSectionIdx}
            onJump={onJumpToSection}
          />
        </div>
      )}

      {/* Row 3: Calm read-only Stage Notes bar if notes exist */}
      {song.notes.trim() && (
        <div className="-mx-4 sm:-mx-6 lg:-mx-8">
          <StageNotesBar
            notes={song.notes}
            editing={false}
            onStartEdit={onStartEditNotes}
          />
        </div>
      )}
    </div>
  );
}
