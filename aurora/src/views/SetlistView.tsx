import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useSongStore } from '@/lib/stores/song-store';
import { useLiveSessionStatus } from '@/lib/stores/live-session-store';
import { computeSetlistDuration, formatSetlistDuration } from '@/lib/utils/autoscroll';
import { formatDuration } from '@/lib/utils/chordpro-parser';
import { isMinorKey, normalizeSearch } from '@/lib/utils/music';
import type { ParsedSong } from '@/lib/types/song';
import { AuroraButton, AuroraCollapsible, AuroraIconButton, UiIcon } from '../aurora/primitives';
import { getDisplayTitleAndArtist, getEffectiveKey } from '../utils/song-display';
import { AuroraLink, navigate } from '../router';

export function SetlistView({ setlistId }: { setlistId: string }) {
  const {
    setlists,
    isLoaded: setlistsLoaded,
    renameSetlist,
    removeSongFromSetlist,
    insertSongAt,
    reorderSong,
    addSongToSetlist,
  } = useSetlistStore();
  const entries = useSongStore((s) => s.entries);
  const songsLoaded = useSongStore((s) => s.isLoaded);
  const getSongs = useSongStore((s) => s.getSongs);
  const liveStatus = useLiveSessionStatus(setlistId);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [announceMsg, setAnnounceMsg] = useState('');
  const [lastMovedId, setLastMovedId] = useState<string | null>(null);
  const [undoItem, setUndoItem] = useState<{ songId: string; title: string; idx: number } | null>(
    null
  );
  const undoTimer = useRef<number | null>(null);
  const moveHighlightTimer = useRef<number | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const prevRowTopsRef = useRef<Map<string, number> | null>(null);

  const snapshotRows = () => {
    if (
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      prevRowTopsRef.current = null;
      return;
    }
    const snap = new Map<string, number>();
    rowRefs.current.forEach((el, id) => {
      snap.set(id, el.getBoundingClientRect().top);
    });
    prevRowTopsRef.current = snap;
  };

  useEffect(() => {
    if (!showAdd) return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById('setlist-add-search')?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [showAdd]);

  useEffect(() => {
    return () => {
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      if (moveHighlightTimer.current) window.clearTimeout(moveHighlightTimer.current);
    };
  }, []);

  const setlist = setlists.find((sl) => sl.id === setlistId);
  const songIdsKey = setlist ? setlist.songIds.join('|') : '';

  useLayoutEffect(() => {
    const prev = prevRowTopsRef.current;
    prevRowTopsRef.current = null;
    if (!prev || prev.size === 0) return;

    const moves: { el: HTMLLIElement; dy: number; isMoved: boolean }[] = [];
    rowRefs.current.forEach((el, id) => {
      const oldTop = prev.get(id);
      if (oldTop === undefined) return;
      const dy = oldTop - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 0.5) {
        moves.push({ el, dy, isMoved: id === lastMovedId });
      }
    });
    if (moves.length === 0) return;

    moves.forEach(({ el, dy, isMoved }) => {
      el.style.transition = 'none';
      el.style.transform = `translate3d(0, ${dy}px, 0)`;
      if (isMoved) el.style.zIndex = '2';
    });
    void document.body.offsetHeight;
    moves.forEach(({ el }) => {
      el.style.transition =
        'transform var(--ui-motion-expressive-fast), background-color var(--ui-motion-effect-default), border-color var(--ui-motion-effect-slow)';
      el.style.transform = '';
      window.setTimeout(() => {
        el.style.transition = '';
        el.style.zIndex = '';
      }, 380);
    });
  }, [songIdsKey, lastMovedId]);
  const allSongs = useMemo(() => {
    void entries;
    return getSongs();
  }, [entries, getSongs]);

  const orderedEntries = useMemo(() => {
    if (!setlist) return [];
    return setlist.songIds
      .map((sid, storeIdx) => ({ song: allSongs.find((s) => s.id === sid), storeIdx }))
      .filter((e): e is { song: ParsedSong; storeIdx: number } => e.song !== undefined);
  }, [setlist, allSongs]);

  useEffect(() => {
    if (setlist) document.title = `${setlist.name} - Jamshelf`;
  }, [setlist?.name]);

  if (!setlist) {
    return (
      <main id="main" tabIndex={-1} className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10 space-y-4">
        <h1 className="typescale-headline-md text-on-surface m-0">
          {!setlistsLoaded || !songsLoaded ? 'Carregando setlist...' : 'Setlist não encontrado'}
        </h1>
        <AuroraButton color="tonal" icon="arrow_back" onClick={() => navigate('/?tab=setlists')}>
          Voltar para setlists
        </AuroraButton>
      </main>
    );
  }

  const setlistSongs = orderedEntries.map((e) => e.song);
  const dur = setlistSongs.length > 0 ? computeSetlistDuration(setlistSongs) : null;
  const durLabel = dur ? formatSetlistDuration(dur.totalSec, dur.estimatedCount > 0) : null;
  const startSongId =
    (liveStatus.leaderId && liveStatus.currentSongId) || setlistSongs[0]?.id || null;

  const qNorm = normalizeSearch(search);
  const candidates = allSongs.filter((s) => {
    if (setlist.songIds.includes(s.id)) return false;
    if (!qNorm) return true;
    const effKey = getEffectiveKey(s).key;
    return (
      normalizeSearch(s.title).includes(qNorm) ||
      normalizeSearch(s.artist).includes(qNorm) ||
      normalizeSearch(s.displayKey).includes(qNorm) ||
      normalizeSearch(effKey).includes(qNorm)
    );
  });

  const handleRemove = (songId: string, title: string, storeIdx: number, visibleIdx: number) => {
    const nextTargetId =
      orderedEntries[visibleIdx + 1]?.song.id ?? orderedEntries[visibleIdx - 1]?.song.id ?? null;
    snapshotRows();
    removeSongFromSetlist(setlistId, songId);
    setUndoItem({ songId, title, idx: storeIdx });
    setAnnounceMsg(`${title} removida do setlist.`);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndoItem(null), 6000);
    window.requestAnimationFrame(() => {
      if (nextTargetId) {
        document.getElementById(`setlist-remove-${nextTargetId}`)?.focus({ preventScroll: true });
      } else {
        document.getElementById('setlist-add-toggle')?.focus({ preventScroll: true });
      }
    });
  };

  const handleMove = (
    songId: string,
    title: string,
    fromStoreIdx: number,
    toStoreIdx: number,
    nextVisibleIdx: number,
    dir: 'up' | 'down'
  ) => {
    snapshotRows();
    reorderSong(setlistId, fromStoreIdx, toStoreIdx);
    setLastMovedId(songId);
    setAnnounceMsg(`${title} movida para a posição ${nextVisibleIdx + 1} de ${orderedEntries.length}.`);
    if (moveHighlightTimer.current) window.clearTimeout(moveHighlightTimer.current);
    moveHighlightTimer.current = window.setTimeout(() => setLastMovedId(null), 900);
    const hitBoundary =
      (dir === 'up' && nextVisibleIdx === 0) ||
      (dir === 'down' && nextVisibleIdx === orderedEntries.length - 1);
    const focusDir = hitBoundary ? (dir === 'up' ? 'down' : 'up') : dir;
    window.requestAnimationFrame(() => {
      document.getElementById(`setlist-${focusDir}-${songId}`)?.focus({ preventScroll: true });
    });
  };

  const handleUndo = () => {
    if (!undoItem) return;
    const restoredId = undoItem.songId;
    snapshotRows();
    insertSongAt(setlistId, restoredId, undoItem.idx);
    setAnnounceMsg(`${undoItem.title} restaurada no setlist.`);
    setUndoItem(null);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    window.requestAnimationFrame(() => {
      document.getElementById(`setlist-remove-${restoredId}`)?.focus({ preventScroll: true });
    });
  };

  return (
    <main id="main" tabIndex={-1} className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 pb-28 md:pb-12 space-y-6 focus:outline-none">
      <div role="status" aria-live="polite" className="sr-only">
        {announceMsg}
      </div>
      {/* Breadcrumb */}
      <nav aria-label="Caminho" className="flex items-center gap-1.5 typescale-body-sm text-on-surface-variant">
        <AuroraLink href="/?tab=setlists" className="stage-breadcrumb-link">
          Setlists
        </AuroraLink>
        <UiIcon name="chevron_right" size={20} />
        <span className="text-on-surface truncate">{setlist.name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1 min-w-0 flex-1">
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!nameInput.trim()) return;
                renameSetlist(setlistId, nameInput.trim());
                setEditingName(false);
                window.requestAnimationFrame(() => {
                  document.getElementById('setlist-rename-btn')?.focus({ preventScroll: true });
                });
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <label htmlFor="rename-setlist-input" className="sr-only">
                Novo nome do setlist
              </label>
              <input
                id="rename-setlist-input"
                type="text"
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditingName(false);
                    window.requestAnimationFrame(() => {
                      document.getElementById('setlist-rename-btn')?.focus({ preventScroll: true });
                    });
                  }
                }}
                className="stage-field max-w-md"
              />
              <AuroraButton type="submit" color="filled" disabled={!nameInput.trim()}>
                Salvar
              </AuroraButton>
              <AuroraButton
                color="outlined"
                onClick={() => {
                  setEditingName(false);
                  window.requestAnimationFrame(() => {
                    document.getElementById('setlist-rename-btn')?.focus({ preventScroll: true });
                  });
                }}
              >
                Cancelar
              </AuroraButton>
            </form>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="typescale-headline-md sm:typescale-display-sm text-on-surface m-0 line-clamp-2 sm:truncate">
                {setlist.name}
              </h1>
              <AuroraIconButton
                id="setlist-rename-btn"
                icon="edit"
                label="Renomear setlist"
                onClick={() => {
                  setNameInput(setlist.name);
                  setEditingName(true);
                }}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 typescale-body-md text-on-surface-variant">
            <span className="font-mono tabular-nums">
              {setlistSongs.length} {setlistSongs.length === 1 ? 'música' : 'músicas'}
              {durLabel ? ` · ${durLabel}` : ''}
            </span>
            {liveStatus.leaderId && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-error-container text-on-error-container typescale-label-sm">
                <UiIcon name="sensors" size={20} />
                <span>{liveStatus.leaderName || 'Banda'} ao vivo</span>
              </span>
            )}
          </div>
        </div>

        <div className="w-full sm:w-auto grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          {startSongId && (
            <>
              <AuroraButton
                color="filled"
                icon="play_arrow"
                className="sm:order-3"
                onClick={() => navigate(`/song/${startSongId}?setlist=${setlistId}&show=1`)}
              >
                Modo show
              </AuroraButton>
              <AuroraButton
                color="tonal"
                icon="slideshow"
                className="sm:order-2"
                onClick={() => navigate(`/slides?setlist=${setlistId}`)}
              >
                Slides
              </AuroraButton>
            </>
          )}
          <AuroraButton
            id="setlist-add-toggle"
            color={showAdd ? 'tonal' : 'outlined'}
            icon={showAdd ? 'close' : 'playlist_add'}
            aria-expanded={showAdd}
            className="col-span-2 sm:col-span-1 sm:order-1"
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? 'Fechar busca' : 'Adicionar músicas'}
          </AuroraButton>
        </div>
      </div>

      {/* Floating Undo snackbar (static centering wrapper + keyed spring entrance) */}
      {undoItem && (
        <div className="fixed bottom-20 md:bottom-6 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
          <div
            key={undoItem.songId}
            role="status"
            aria-live="polite"
            className="dock-enter-bottom inverse-snackbar pointer-events-auto w-full max-w-md rounded-2xl bg-inverse-surface text-inverse-on-surface px-4 py-2.5 flex items-center justify-between gap-3"
            style={{ boxShadow: 'var(--ui-elevation-overlay)' }}
          >
            <span className="typescale-body-md truncate">"{undoItem.title}" removida.</span>
            <AuroraButton color="text" onClick={handleUndo} className="text-inverse-primary flex-shrink-0">
              Desfazer
            </AuroraButton>
          </div>
        </div>
      )}

      {/* Add songs inline expansion panel */}
      <AuroraCollapsible open={showAdd}>
        <section
          aria-label="Adicionar músicas ao setlist"
          className="rounded-[24px] bg-surface-container-low p-5 space-y-3"
        >
          <label htmlFor="setlist-add-search" className="sr-only">
            Buscar música para incluir no setlist
          </label>
          <div className="relative flex items-center">
            <input
              id="setlist-add-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar no repertório por título, artista ou tom..."
              className="stage-field pr-12"
            />
            {search && (
              <AuroraIconButton
                icon="close"
                label="Limpar busca de músicas"
                onClick={() => setSearch('')}
                className="absolute right-0.5"
              />
            )}
          </div>
          {candidates.length === 0 ? (
            <p className="typescale-body-sm text-on-surface-variant m-0">
              {allSongs.length > 0 && allSongs.every((s) => setlist.songIds.includes(s.id))
                ? 'Todas as músicas do repertório já estão neste setlist.'
                : allSongs.length === 0
                  ? 'Seu repertório ainda não possui músicas cadastradas.'
                  : 'Nenhuma música disponível corresponde à busca.'}
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {candidates.map((s) => {
                const info = getDisplayTitleAndArtist(s);
                const eff = getEffectiveKey(s);
                return (
                  <div
                    key={s.id}
                    className="stage-list-row rounded-2xl bg-surface hover:bg-surface-container px-4 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="typescale-title-md text-on-surface truncate">{info.title}</div>
                      <div className="typescale-body-sm text-on-surface-variant truncate">
                        {info.artist || 'Sem artista'} · Tom {eff.key || '-'} · {s.tempo} BPM
                      </div>
                    </div>
                    <AuroraButton
                      color="tonal"
                      icon="add"
                      onClick={() => {
                        addSongToSetlist(setlistId, s.id);
                        setAnnounceMsg(`${info.title} incluída no setlist.`);
                      }}
                    >
                      Incluir
                    </AuroraButton>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </AuroraCollapsible>

      {/* Ordered sequence */}
      {orderedEntries.length === 0 ? (
        <div className="rounded-[24px] bg-surface-container-low px-6 py-14 text-center flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary-container text-on-primary-container flex items-center justify-center">
            <UiIcon name="queue_music" size={24} />
          </div>
          <h2 className="typescale-title-lg text-on-surface m-0">Setlist vazio</h2>
          <p className="typescale-body-md text-on-surface-variant max-w-md m-0">
            Inclua músicas do repertório para definir a ordem do ensaio ou show.
          </p>
          <AuroraButton color="filled" icon="playlist_add" onClick={() => setShowAdd(true)}>
            Adicionar músicas
          </AuroraButton>
        </div>
      ) : (
        <ol className="m-0 p-0 list-none space-y-2">
          {orderedEntries.map(({ song, storeIdx }, idx) => {
            const { title, artist } = getDisplayTitleAndArtist(song);
            const effKey = getEffectiveKey(song).key;
            const minor = isMinorKey(effKey);
            const justMoved = lastMovedId === song.id;
            return (
              <li
                key={song.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(song.id, el);
                  else rowRefs.current.delete(song.id);
                }}
                data-just-moved={justMoved ? 'true' : undefined}
                className="stage-card stage-card-interactive px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-7 text-center typescale-label-lg text-on-surface-variant font-mono tabular-nums flex-shrink-0">
                    {idx + 1}
                  </span>
                  <AuroraLink
                    href={`/song/${song.id}?setlist=${setlistId}`}
                    aria-label={`${idx + 1}. ${title}, ${artist || 'Sem artista'}${effKey ? `, Tom ${effKey}` : ''}`}
                    className="min-w-0 flex-1 no-underline text-on-surface after:absolute after:inset-0"
                  >
                    <div className="typescale-emphasized-title-md text-on-surface truncate">
                      {title}
                    </div>
                    <div className="typescale-body-sm text-on-surface-variant truncate">
                      <span>{artist || 'Sem artista'}</span>
                      <span className="font-mono tabular-nums">
                        {' · '}
                        {[
                          `${song.tempo} BPM`,
                          song.duration ? formatDuration(song.duration) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                  </AuroraLink>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 pl-10 sm:pl-0 flex-shrink-0">
                  {effKey ? (
                    <span
                      className={`pointer-events-none px-2.5 sm:px-3 py-1 rounded-xl font-mono typescale-label-sm flex-shrink-0 ${
                        minor
                          ? 'bg-minor-bg text-minor-ink'
                          : 'bg-primary-container text-on-primary-container'
                      }`}
                    >
                      {effKey}
                    </span>
                  ) : (
                    <span className="sm:hidden" />
                  )}
                  <div className="relative z-10 flex items-center gap-0.5 sm:gap-1 -my-1.5 -mr-2 sm:my-0 sm:mr-0 self-end sm:self-auto">
                    <AuroraIconButton
                      id={`setlist-up-${song.id}`}
                      icon="arrow_upward"
                      label={`Mover ${title} para cima`}
                      disabled={idx === 0}
                      onClick={() =>
                        handleMove(song.id, title, storeIdx, orderedEntries[idx - 1].storeIdx, idx - 1, 'up')
                      }
                    />
                    <AuroraIconButton
                      id={`setlist-down-${song.id}`}
                      icon="arrow_downward"
                      label={`Mover ${title} para baixo`}
                      disabled={idx === orderedEntries.length - 1}
                      onClick={() =>
                        handleMove(song.id, title, storeIdx, orderedEntries[idx + 1].storeIdx, idx + 1, 'down')
                      }
                    />
                    <AuroraIconButton
                      id={`setlist-remove-${song.id}`}
                      icon="close"
                      label={`Remover ${title} do setlist`}
                      onClick={() => handleRemove(song.id, title, storeIdx, idx)}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
