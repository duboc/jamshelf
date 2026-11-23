'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { usePlayerStore } from '@/lib/stores/player-store';
import { navigateWithTransition } from '@/lib/utils/view-transition';
import { SlideshowView } from '@/components/slides/SlideshowView';
import type { ParsedSong } from '@/lib/types/song';

export default function SlidesPage() {
  return (
    <Suspense fallback={null}>
      <SlidesContent />
    </Suspense>
  );
}

function SlidesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setlistId = searchParams.get('setlist');
  const songId = searchParams.get('song');

  const entries = useSongStore((s) => s.entries);
  const songsLoaded = useSongStore((s) => s.isLoaded);
  const getSong = useSongStore((s) => s.getSong);
  const setlists = useSetlistStore((s) => s.setlists);
  const setlistsLoaded = useSetlistStore((s) => s.isLoaded);
  const playerTranspose = usePlayerStore((s) => s.transpose);
  const playerUseFlats = usePlayerStore((s) => s.useFlats);

  const activeSetlist = useMemo(
    () => (setlistId ? setlists.find((sl) => sl.id === setlistId) ?? null : null),
    [setlistId, setlists]
  );

  const deckSongs: ParsedSong[] = useMemo(() => {
    void entries;
    if (activeSetlist) {
      return activeSetlist.songIds
        .map((sid) => getSong(sid))
        .filter((s): s is ParsedSong => s !== null);
    }
    if (songId) {
      const single = getSong(songId);
      return single ? [single] : [];
    }
    return [];
  }, [entries, activeSetlist, songId, getSong]);

  const waitingForData = (!songsLoaded && deckSongs.length === 0) || (Boolean(setlistId) && !setlistsLoaded && !activeSetlist);

  if (waitingForData) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="fixed inset-0 bg-[var(--bg)] flex flex-col p-5 gap-4 focus:outline-none"
      >
        <span className="sr-only">Carregando slides...</span>
        <div className="gm3-skeleton h-12 w-full rounded-2xl" />
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="gm3-skeleton rounded-[24px]" />
          <div className="gm3-skeleton rounded-[24px] hidden lg:block" />
        </div>
        <div className="gm3-skeleton h-12 w-full rounded-2xl" />
      </main>
    );
  }

  if (deckSongs.length === 0) {
    const fallbackHref = setlistId ? `/setlists/${setlistId}` : '/';
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="fixed inset-0 bg-[var(--bg)] text-[var(--ink)] flex flex-col items-center justify-center gap-3 px-6 text-center focus:outline-none"
      >
        <h1 className="font-display text-xl font-bold">Nenhuma música para apresentar</h1>
        <p className="text-sm text-[var(--muted)] max-w-sm">
          {setlistId
            ? 'Este setlist está vazio ou não foi encontrado. Adicione músicas antes de abrir os slides.'
            : 'Escolha uma música ou setlist para iniciar o modo slides.'}
        </p>
        <button
          type="button"
          onClick={() => navigateWithTransition(router, fallbackHref, { direction: 'back' })}
          className="pill-btn pill-btn-primary h-11 px-5 text-sm mt-1"
        >
          Voltar
        </button>
      </main>
    );
  }

  const handleExit = (currentSongId: string) => {
    if (setlistId && !songId) {
      navigateWithTransition(router, `/setlists/${setlistId}`, { direction: 'back' });
      return;
    }
    const target = setlistId
      ? `/song/${currentSongId}?setlist=${setlistId}`
      : `/song/${currentSongId}`;
    navigateWithTransition(router, target, { direction: 'back' });
  };

  const handleSwitchToClean = (currentSongId: string) => {
    const target = setlistId
      ? `/song/${currentSongId}?setlist=${setlistId}&show=1`
      : `/song/${currentSongId}?clean=1`;
    navigateWithTransition(router, target, { direction: 'fade' });
  };

  return (
    <SlideshowView
      songs={deckSongs}
      initialSongId={songId}
      activeSetlist={activeSetlist}
      initialTranspose={songId ? playerTranspose : 0}
      initialUseFlats={songId ? playerUseFlats : false}
      onSwitchToClean={handleSwitchToClean}
      onExit={handleExit}
    />
  );
}
