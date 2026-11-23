'use client';

import type { ParsedSong, Setlist } from '@/lib/types/song';
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
  onNavigateSong: (songId: string) => void;
  onOpenSetlistDrawer: () => void;
  onJumpToSection: (idx: number) => void;
  onStartEditNotes: () => void;
}

/**
 * Scrollable song metadata and section jump strip rendered natively inside ChordSheet.
 * Scrolls 1:1 with the finger/wheel at compositor speed: zero header height jumps, zero scroll-back fight.
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
  onNavigateSong,
  onOpenSetlistDrawer,
  onJumpToSection,
  onStartEditNotes,
}: SongHeroStripProps) {
  return (
    <div data-song-hero="true" className="space-y-2 pb-1">
      {/* Row 1: Artist + compact musical metadata (single focal key badge) */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <span className="text-xs sm:text-[13px] text-[var(--muted)] truncate min-w-0 max-w-[240px]">
            {artistInput || 'Artista não informado'}
          </span>

          <SongMetaPopover
            song={song}
            displayedKey={displayedKey}
            onPatchMeta={onPatchMeta}
            useFocalBadge
          />
        </div>

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
