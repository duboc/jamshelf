'use client';

import { use, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useSongStore } from '@/lib/stores/song-store';
import { useLiveSessionStatus } from '@/lib/stores/live-session-store';
import { usePointerReorder, moveItem } from '@/lib/hooks/use-pointer-reorder';
import { computeSetlistDuration, formatSetlistDuration } from '@/lib/utils/autoscroll';
import { formatDuration } from '@/lib/utils/chordpro-parser';
import { normalizeSearch } from '@/lib/utils/music';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CloseIcon,
  EditIcon,
  GripIcon,
  MusicNoteIcon,
  PlayIcon,
  PlusIcon,
} from '@/components/ui/Icons';

export default function SetlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
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
  const { getSongs } = useSongStore();
  const liveStatus = useLiveSessionStatus(id);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [showAddSong, setShowAddSong] = useState(false);
  const [search, setSearch] = useState('');
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [undoRemoval, setUndoRemoval] = useState<{
    songId: string;
    title: string;
    storeIdx: number;
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setlist = setlists.find((sl) => sl.id === id);

  const allSongs = useMemo(() => {
    void entries;
    return getSongs();
  }, [entries, getSongs]);

  // Keep the index into songIds alongside each song so reordering still
  // targets the right store slot if songIds contains deleted song IDs.
  const baseEntries = useMemo(
    () =>
      (setlist?.songIds ?? [])
        .map((sid, storeIdx) => ({ song: allSongs.find((s) => s.id === sid), storeIdx }))
        .filter(
          (e): e is { song: (typeof allSongs)[number]; storeIdx: number } => e.song !== undefined
        ),
    [setlist?.songIds, allSongs]
  );

  const { drag, getHandleProps } = usePointerReorder({
    onReorder: (from, to) => {
      const movedSong = baseEntries[from]?.song;
      reorderSong(id, baseEntries[from].storeIdx, baseEntries[to].storeIdx);
      if (movedSong) {
        setLiveAnnouncement(`${movedSong.title} movida para a posição ${to + 1}.`);
      }
    },
  });

  if (!setlist) {
    if (!setlistsLoaded || !songsLoaded) {
      return (
        <div className="flex-1 flex flex-col">
          <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Setlists', href: '/?tab=setlists' }, { label: 'Carregando...' }]} />
          <main id="main-content" className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-5 space-y-4" aria-busy="true">
            <div className="h-10 w-64 rounded-2xl bg-[var(--surface)] animate-pulse" />
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, idx) => (
                <div key={idx} className="h-20 rounded-[16px] bg-[var(--surface)] animate-pulse" />
              ))}
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col">
        <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Setlists', href: '/?tab=setlists' }, { label: 'Não encontrado' }]} />
        <main id="main-content" className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-[var(--muted)]">Esse setlist não foi encontrado.</p>
          <button
            type="button"
            onClick={() => router.push('/?tab=setlists')}
            className="pill-btn h-10 px-4 text-xs"
          >
            Voltar para Setlists
          </button>
        </main>
      </div>
    );
  }

  const displayEntries = drag ? moveItem(baseEntries, drag.from, drag.to) : baseEntries;
  const setlistSongs = displayEntries.map((e) => e.song);
  const durationSummary = setlistSongs.length > 0 ? computeSetlistDuration(setlistSongs) : null;
  const durationLabel = durationSummary
    ? formatSetlistDuration(durationSummary.totalSec, durationSummary.estimatedCount > 0)
    : null;

  const startSongId =
    (liveStatus.leaderId && liveStatus.currentSongId) || setlistSongs[0]?.id || null;

  const notInSetlist = allSongs.filter((s) => !setlist.songIds.includes(s.id));
  const qNorm = normalizeSearch(search);
  const filtered = notInSetlist.filter((s) => {
    if (!qNorm) return true;
    return (
      normalizeSearch(s.title).includes(qNorm) ||
      normalizeSearch(s.artist).includes(qNorm) ||
      normalizeSearch(s.displayKey).includes(qNorm)
    );
  });

  const startRename = () => {
    setNameInput(setlist.name);
    setEditingName(true);
  };

  const commitRename = () => {
    if (nameInput.trim()) {
      renameSetlist(id, nameInput.trim());
      setLiveAnnouncement(`Setlist renomeado para ${nameInput.trim()}.`);
    }
    setEditingName(false);
  };

  const handleRemoveWithUndo = (songId: string, title: string, storeIdx: number) => {
    removeSongFromSetlist(id, songId);
    setUndoRemoval({ songId, title, storeIdx });
    setLiveAnnouncement(`${title} removida do setlist.`);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoRemoval(null), 6000);
  };

  const handleUndoRemove = () => {
    if (!undoRemoval) return;
    insertSongAt(id, undoRemoval.songId, undoRemoval.storeIdx);
    setLiveAnnouncement(`${undoRemoval.title} restaurada no setlist.`);
    setUndoRemoval(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };

  const handleMoveKeyboard = (idx: number, delta: -1 | 1) => {
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= baseEntries.length) return;
    const movedSong = baseEntries[idx].song;
    reorderSong(id, baseEntries[idx].storeIdx, baseEntries[targetIdx].storeIdx);
    setLiveAnnouncement(`${movedSong.title} movida para a posição ${targetIdx + 1}.`);
  };

  return (
    <div className="flex-1 flex flex-col">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Setlists', href: '/?tab=setlists' },
          { label: setlist.name },
        ]}
        rightSlot={
          liveStatus.leaderId ? (
            <span className="studio-chip text-[var(--on-rec-container)] bg-[var(--rec-dim)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--rec-dot)] animate-pulse" />
              {liveStatus.leaderName} ao vivo
            </span>
          ) : undefined
        }
      />

      <main id="main-content" className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        <div className="sr-only" role="status" aria-live="polite">
          {liveAnnouncement}
        </div>

        {/* Header */}
        <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
              {editingName ? (
                <input
                  autoFocus
                  aria-label="Renomear setlist"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  className="font-display text-3xl bg-transparent border-b-2 border-[var(--accent)] outline-none text-[var(--ink)] min-w-[200px]"
                />
              ) : (
                <button
                  type="button"
                  onClick={startRename}
                  title="Clique para renomear o setlist"
                  className="group text-left cursor-pointer"
                >
                  <h1 className="font-display text-3xl sm:text-4xl text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors leading-tight">
                    {setlist.name}
                    {'\u00A0'}
                    <span className="inline-flex align-middle text-[var(--muted)] group-hover:text-[var(--accent)]" aria-hidden="true">
                      <EditIcon size={17} />
                    </span>
                  </h1>
                </button>
              )}
              <span className="font-expressive text-lg text-[var(--muted)]">
                {setlistSongs.length} {setlistSongs.length === 1 ? 'música' : 'músicas'}
                {durationLabel ? ` · ${durationLabel}` : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => startSongId && router.push(`/song/${startSongId}?setlist=${id}&show=1`)}
              disabled={!startSongId}
              title={
                !startSongId
                  ? 'Adicione uma música primeiro'
                  : 'Abrir visão de palco focada com deslize entre músicas'
              }
              className="pill-btn pill-btn-rec h-11 px-5 text-sm"
            >
              <PlayIcon size={14} />
              Modo Show
            </button>
            <button
              type="button"
              onClick={() => setShowAddSong((v) => !v)}
              className="pill-btn pill-btn-tonal h-11 px-5 text-sm"
            >
              {showAddSong ? (
                'Fechar lista'
              ) : (
                <>
                  <PlusIcon size={16} />
                  Adicionar música
                </>
              )}
            </button>
          </div>
        </section>

        {/* Undo snackbar for accidental setlist track removal */}
        {undoRemoval && (
          <div
            role="status"
            aria-live="polite"
            className="gm3-dialog-enter rounded-2xl bg-[var(--surface)] px-4 py-3 flex items-center justify-between gap-3 text-sm"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <span className="text-[var(--ink)]">
              &ldquo;{undoRemoval.title}&rdquo; removida do setlist.
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleUndoRemove}
                className="pill-btn pill-btn-tonal h-9 px-4 text-xs font-semibold"
              >
                Desfazer
              </button>
              <button
                type="button"
                onClick={() => setUndoRemoval(null)}
                aria-label="Dispensar aviso"
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:bg-[var(--surface-high)] cursor-pointer"
              >
                <CloseIcon size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Add song picker */}
        {showAddSong && (
          <section className="gm3-card gm3-dialog-enter rounded-[24px] bg-[var(--surface)] p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="field-label">Adicionar do repertório</span>
              <button
                type="button"
                onClick={() => {
                  setShowAddSong(false);
                  setSearch('');
                }}
                className="text-xs font-medium text-[var(--accent-ink)] hover:underline cursor-pointer"
              >
                Concluir
              </button>
            </div>
            <input
              autoFocus
              type="text"
              aria-label="Buscar música ou artista para incluir no setlist"
              placeholder="Buscar música ou artista para incluir..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="studio-input w-full px-4 py-2.5 text-sm"
            />
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filtered.length === 0 ? (
                <div className="text-center py-6 text-[var(--muted)] text-sm">
                  {notInSetlist.length === 0
                    ? 'Todas as músicas do repertório já estão neste setlist.'
                    : 'Nenhuma música encontrada.'}
                </div>
              ) : (
                filtered.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => {
                      addSongToSetlist(id, song.id);
                      setLiveAnnouncement(`${song.title} adicionada ao setlist.`);
                      setSearch('');
                    }}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl hover:bg-[var(--surface-high)] transition-colors text-left cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-[16px] font-display font-bold text-[var(--ink)] truncate">{song.title}</div>
                      <div className="text-xs text-[var(--muted)] truncate">
                        {song.artist || 'Artista não informado'}
                        {song.displayKey ? ` · ${song.displayKey}` : ''}
                      </div>
                    </div>
                    <span className="pill-btn pill-btn-tonal px-3 py-1.5 text-xs flex-shrink-0">
                      <PlusIcon size={13} /> Incluir
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        )}

        {/* Ordered song list (GM3 Expressive segmented stack) */}
        <section className="space-y-2">
          {setlistSongs.length === 0 ? (
            <div className="gm3-card rounded-[24px] bg-[var(--surface)] px-6 py-16 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[var(--primary-container)] text-[var(--on-primary-container)] flex items-center justify-center">
                <MusicNoteIcon size={22} />
              </div>
              <h2 className="font-display text-lg font-bold text-[var(--ink)]">Setlist ainda vazio</h2>
              <p className="text-sm text-[var(--muted)] max-w-md">
                Toque em &ldquo;Adicionar música&rdquo; para montar a ordem do ensaio ou do show.
              </p>
              <button
                type="button"
                onClick={() => setShowAddSong(true)}
                className="pill-btn pill-btn-primary h-10 px-5 text-sm mt-1"
              >
                <PlusIcon size={16} />
                Adicionar música
              </button>
            </div>
          ) : (
            <>
              <div className="px-2 flex items-center justify-between gap-2 text-xs font-medium text-[var(--muted)]">
                <span>Ordem das faixas</span>
                <span className="hidden sm:inline">Arraste ou use ↑↓ para reordenar</span>
              </div>
              <div className="flex flex-col gap-[2px]">
                {displayEntries.map(({ song, storeIdx }, idx) => {
                  const segRadius =
                    setlistSongs.length === 1
                      ? 'rounded-[20px]'
                      : idx === 0
                      ? 'rounded-t-[20px] rounded-b-[6px]'
                      : idx === setlistSongs.length - 1
                      ? 'rounded-b-[20px] rounded-t-[6px]'
                      : 'rounded-[6px]';

                  return (
                    <div
                      key={song.id}
                      data-display-idx={idx}
                      className={`gm3-card group flex items-center gap-3 py-3.5 px-4 sm:px-5 bg-[var(--surface)] transition-colors ${segRadius} ${
                        drag !== null && drag.to === idx
                          ? 'bg-[var(--secondary-container)]/60 ring-2 ring-[var(--accent)]'
                          : 'hover:bg-[var(--surface-high)]'
                      }`}
                    >
                      <div
                        {...getHandleProps(idx)}
                        title="Arrastar para reordenar"
                        className="flex items-center gap-2 text-[var(--muted)] select-none touch-none cursor-grab active:cursor-grabbing py-1 px-1 -ml-1 flex-shrink-0"
                      >
                        <GripIcon size={16} />
                        <span className="font-expressive text-xl text-[var(--accent)] w-7 text-right">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                      </div>

                      <Link href={`/song/${song.id}?setlist=${id}`} className="flex-1 min-w-0">
                        <div className="font-display text-[20px] font-bold leading-snug text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors break-words sm:truncate">
                          {song.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-[var(--muted)]">
                          <span className="truncate">{song.artist || 'Artista não informado'}</span>
                          {song.displayKey && (
                            <span className="studio-chip bg-[var(--primary-container)] text-[var(--on-primary-container)] font-semibold">
                              {song.displayKey}
                            </span>
                          )}
                          <span className="studio-chip bg-[var(--bg)] text-[var(--muted)] font-mono tabular-nums">
                            {song.tempo} BPM{song.duration ? ` · ${formatDuration(song.duration)}` : ''}
                          </span>
                          {song.notes && (
                            <span className="studio-chip bg-[var(--warn-dim)] text-[var(--warn-ink)] max-w-full sm:max-w-[360px] truncate">
                              {song.notes}
                            </span>
                          )}
                        </div>
                      </Link>

                      {/* Keyboard & single-tap reorder + remove controls (WCAG 2.1.1 / 2.5.7) */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveKeyboard(idx, -1)}
                          className="w-9 h-9 rounded-full hidden sm:flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          title="Mover para cima"
                          aria-label={`Mover ${song.title} para cima`}
                        >
                          <ArrowUpIcon size={15} />
                        </button>
                        <button
                          type="button"
                          disabled={idx === displayEntries.length - 1}
                          onClick={() => handleMoveKeyboard(idx, 1)}
                          className="w-9 h-9 rounded-full hidden sm:flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          title="Mover para baixo"
                          aria-label={`Mover ${song.title} para baixo`}
                        >
                          <ArrowDownIcon size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveWithUndo(song.id, song.title, storeIdx)}
                          className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--rec)] hover:bg-[var(--surface2)] transition-colors cursor-pointer"
                          title="Remover do setlist"
                          aria-label={`Remover ${song.title} do setlist`}
                        >
                          <CloseIcon size={17} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
