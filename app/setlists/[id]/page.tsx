'use client';

import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useSongStore } from '@/lib/stores/song-store';
import { useLiveSessionStatus } from '@/lib/stores/live-session-store';
import { usePointerReorder, moveItem } from '@/lib/hooks/use-pointer-reorder';
import { computeSetlistDuration, formatSetlistDuration } from '@/lib/utils/autoscroll';
import { formatDuration } from '@/lib/utils/chordpro-parser';
import { Breadcrumb } from '@/components/ui/Breadcrumb';

export default function SetlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { setlists, renameSetlist, removeSongFromSetlist, reorderSong, addSongToSetlist } = useSetlistStore();
  const entries = useSongStore((s) => s.entries);
  const { getSongs } = useSongStore();
  const liveStatus = useLiveSessionStatus(id);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [showAddSong, setShowAddSong] = useState(false);
  const [search, setSearch] = useState('');

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
    onReorder: (from, to) =>
      reorderSong(id, baseEntries[from].storeIdx, baseEntries[to].storeIdx),
  });

  if (!setlist) {
    return (
      <div className="flex-1 flex flex-col">
        <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Setlists', href: '/?tab=setlists' }, { label: 'Não encontrado' }]} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-[var(--muted)]">Esse setlist não foi encontrado.</p>
          <button
            type="button"
            onClick={() => router.push('/?tab=setlists')}
            className="pill-btn px-4 py-2 text-xs"
          >
            Voltar para Setlists
          </button>
        </div>
      </div>
    );
  }

  const displayEntries = drag ? moveItem(baseEntries, drag.from, drag.to) : baseEntries;
  const setlistSongs = displayEntries.map((e) => e.song);
  const durationSummary = setlistSongs.length > 0 ? computeSetlistDuration(setlistSongs) : null;
  const durationLabel = durationSummary
    ? formatSetlistDuration(durationSummary.totalSec, durationSummary.estimatedCount > 0)
    : null;

  // Join an in-progress show on the leader's actual song, not always song 1.
  const startSongId =
    (liveStatus.leaderId && liveStatus.currentSongId) || setlistSongs[0]?.id || null;

  const notInSetlist = allSongs.filter((s) => !setlist.songIds.includes(s.id));
  const filtered = notInSetlist.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      s.displayKey.toLowerCase().includes(q)
    );
  });

  const startRename = () => {
    setNameInput(setlist.name);
    setEditingName(true);
  };

  const commitRename = () => {
    if (nameInput.trim()) renameSetlist(id, nameInput.trim());
    setEditingName(false);
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
            <span className="studio-chip text-[var(--rec)] border border-[var(--rec)]/40 bg-[var(--rec)]/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--rec)] animate-pulse" />
              {liveStatus.leaderName} ao vivo
            </span>
          ) : undefined
        }
      />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Header */}
        <section className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--line)]">
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="eyebrow">Setlist · clique no nome para renomear</div>
            <div className="flex items-baseline gap-3 flex-wrap">
              {editingName ? (
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  className="font-display text-2xl bg-transparent border-b-2 border-[var(--accent)] outline-none text-[var(--ink)] min-w-[200px]"
                />
              ) : (
                <h1
                  className="font-display text-2xl text-[var(--ink)] cursor-pointer hover:text-[var(--accent-ink)] transition-colors leading-tight"
                  title="Clique para renomear"
                  onClick={startRename}
                >
                  {setlist.name}
                </h1>
              )}
              <span className="font-mono text-xs text-[var(--muted)]">
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
              className="pill-btn pill-btn-rec px-3.5 py-1.5 text-xs"
            >
              ▶ Modo Show
            </button>
            <button
              type="button"
              onClick={() => setShowAddSong((v) => !v)}
              className="pill-btn pill-btn-primary px-3.5 py-1.5 text-xs"
            >
              {showAddSong ? 'Fechar lista' : '+ Adicionar música'}
            </button>
          </div>
        </section>

        {/* Add song picker */}
        {showAddSong && (
          <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow">Adicionar do repertório</span>
              <button
                type="button"
                onClick={() => {
                  setShowAddSong(false);
                  setSearch('');
                }}
                className="text-xs font-display font-medium text-[var(--accent-ink)] hover:underline cursor-pointer"
              >
                Concluir
              </button>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Buscar música ou artista para incluir..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="studio-input w-full px-3 py-1.5 text-sm"
            />
            <div className="max-h-60 overflow-y-auto divide-y divide-[var(--line-subtle)] border-t border-[var(--line-subtle)]">
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
                      setSearch('');
                    }}
                    className="w-full flex items-center justify-between gap-3 px-2 py-2.5 hover:bg-[var(--nav-active-bg)]/45 transition-colors text-left cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-display font-medium text-[var(--ink)] truncate">{song.title}</div>
                      <div className="text-xs text-[var(--muted)] truncate">
                        {song.artist || 'Artista não informado'}
                        {song.displayKey ? ` · ${song.displayKey}` : ''}
                      </div>
                    </div>
                    <span className="pill-btn px-2.5 py-1 text-xs text-[var(--accent-ink)]">+ Incluir</span>
                  </button>
                ))
              )}
            </div>
          </section>
        )}

        {/* Ordered song list */}
        <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
          {setlistSongs.length === 0 ? (
            <div className="px-6 py-14 text-center space-y-3">
              <p className="text-sm text-[var(--muted)]">
                Nenhuma música neste setlist ainda. Toque em &ldquo;+ Adicionar música&rdquo; para montar a sequência.
              </p>
              <button
                type="button"
                onClick={() => setShowAddSong(true)}
                className="pill-btn pill-btn-primary px-4 py-1.5 text-xs"
              >
                + Adicionar música
              </button>
            </div>
          ) : (
            <div>
              <div className="px-4 py-2 bg-[var(--surface2)]/75 border-b border-[var(--line)] flex items-center justify-between gap-2 text-[12px] font-display font-medium text-[var(--muted)]">
                <span>Ordem das faixas</span>
                <span className="font-mono text-[11px] font-normal hidden sm:inline">
                  Arraste pelo ícone ⠿ para reordenar
                </span>
              </div>
              <div>
                {setlistSongs.map((song, idx) => (
                  <div
                    key={song.id}
                    data-display-idx={idx}
                    className={`group flex items-center gap-3 py-2.5 px-4 border-b border-[var(--line-subtle)] last:border-b-0 transition-colors ${
                      drag !== null && drag.to === idx
                        ? 'bg-[var(--nav-active-bg)] ring-1 ring-[var(--accent)]'
                        : 'hover:bg-[var(--nav-active-bg)]/40'
                    }`}
                  >
                    {/* Drag handle + order index */}
                    <div
                      {...getHandleProps(idx)}
                      title="Arrastar para reordenar"
                      className="flex items-center gap-2 text-[var(--muted)] select-none touch-none cursor-grab active:cursor-grabbing py-1.5 px-1 -ml-1 flex-shrink-0"
                    >
                      <span className="text-sm leading-none opacity-70">⠿</span>
                      <span className="font-mono text-xs w-5 text-right tabular-nums">
                        {idx + 1}
                      </span>
                    </div>

                    <Link href={`/song/${song.id}?setlist=${id}`} className="flex-1 min-w-0">
                      <div className="font-display text-[14.5px] font-medium leading-snug text-[var(--accent-ink)] group-hover:underline underline-offset-2 truncate">
                        {song.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-[var(--muted)]">
                        <span className="truncate">{song.artist || 'Artista não informado'}</span>
                        {song.displayKey && (
                          <span className="studio-chip bg-[var(--nav-active-bg)] text-[var(--accent-ink)]">
                            {song.displayKey}
                          </span>
                        )}
                        <span className="studio-chip text-[var(--muted)]">{song.tempo} BPM</span>
                        {song.duration && (
                          <span className="studio-chip text-[var(--muted)]">
                            {formatDuration(song.duration)}
                          </span>
                        )}
                        {song.notes && (
                          <span className="studio-chip bg-[color-mix(in_srgb,var(--warn)_14%,var(--surface))] text-[var(--warn)] max-w-[260px] truncate">
                            {song.notes}
                          </span>
                        )}
                      </div>
                    </Link>

                    <button
                      type="button"
                      onClick={() => removeSongFromSetlist(id, song.id)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--rec)] hover:bg-[var(--surface2)] transition-colors cursor-pointer flex-shrink-0"
                      title="Remover do setlist"
                      aria-label={`Remover ${song.title} do setlist`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
