'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { SongCard } from '@/components/song-list/SongCard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { computeSetlistDuration, formatSetlistDuration } from '@/lib/utils/autoscroll';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

type Tab = 'all' | 'favorites' | 'setlists';
type SortMode = 'title' | 'rating' | 'bpm' | 'favorites';
type ViewMode = 'cards' | 'list';

function isTab(value: string | null): value is Tab {
  return value === 'all' || value === 'favorites' || value === 'setlists';
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const entries = useSongStore((s) => s.entries);
  const { getSongs, removeEntry, exportAll, importEntries } = useSongStore();
  const { setlists, createSetlist, deleteSetlist } = useSetlistStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  const songs = useMemo(() => {
    void entries;
    return getSongs();
  }, [entries, getSongs]);

  const tabParam = searchParams.get('tab');
  const tab: Tab = isTab(tabParam) ? tabParam : 'all';

  const [search, setSearch] = useState('');
  const [keyFilter, setKeyFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortMode>('title');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [newSetlistName, setNewSetlistName] = useState('');
  const [showNewSetlist, setShowNewSetlist] = useState(false);
  const [setlistToDelete, setSetlistToDelete] = useState<{ id: string; name: string } | null>(null);

  const favoriteCount = useMemo(() => songs.filter((s) => s.favorite).length, [songs]);

  const availableKeys = useMemo(() => {
    const keys = new Set<string>();
    songs.forEach((s) => {
      if (s.displayKey) keys.add(s.displayKey);
    });
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [songs]);

  const filteredSongs = useMemo(() => {
    const base = tab === 'favorites' ? songs.filter((s) => s.favorite) : songs;
    const q = search.trim().toLowerCase();

    const matched = base.filter((s) => {
      if (keyFilter && s.displayKey !== keyFilter) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.displayKey.toLowerCase().includes(q)
      );
    });

    return [...matched].sort((a, b) => {
      if (sortBy === 'rating') return b.rating - a.rating || a.title.localeCompare(b.title);
      if (sortBy === 'bpm') return b.tempo - a.tempo || a.title.localeCompare(b.title);
      if (sortBy === 'favorites') {
        return Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title);
      }
      return a.title.localeCompare(b.title);
    });
  }, [songs, tab, search, keyFilter, sortBy]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2600);
  };

  const handleExportAll = () => {
    const cho = exportAll();
    navigator.clipboard
      .writeText(cho)
      .then(() => showToast('Todas as músicas foram copiadas em formato ChordPro (.cho).'))
      .catch(() => showToast('Não foi possível acessar a área de transferência.'));
  };

  const handleImport = () => {
    if (!importText.trim()) {
      setImportMsg('Cole o conteúdo de um arquivo ChordPro primeiro.');
      return;
    }
    const count = importEntries(importText.trim());
    if (count > 0) {
      setImportMsg(
        count === 1
          ? '1 música importada com sucesso.'
          : `${count} músicas importadas com sucesso.`
      );
      setImportText('');
      setTimeout(() => {
        setShowImport(false);
        setImportMsg('');
      }, 1300);
    } else {
      setImportMsg('Não foi possível ler o ChordPro. Confira se o texto começa com {title: ...}.');
    }
  };

  const handleCreateSetlist = () => {
    const name = newSetlistName.trim();
    if (!name) return;
    const sl = createSetlist(name);
    setNewSetlistName('');
    setShowNewSetlist(false);
    router.push(`/setlists/${sl.id}`);
  };

  const pageHeading =
    tab === 'favorites'
      ? {
          title: 'Favoritas',
          countNum: favoriteCount,
          countLabel: favoriteCount === 1 ? 'música' : 'músicas',
        }
      : tab === 'setlists'
      ? {
          title: 'Setlists',
          countNum: setlists.length,
          countLabel: setlists.length === 1 ? 'setlist' : 'setlists',
        }
      : {
          title: 'Repertório',
          countNum: songs.length,
          countLabel: songs.length === 1 ? 'música' : 'músicas',
        };

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6">
      {/* Expressive GM3 Page Header directly on the #F0F4F9 canvas */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-[32px] sm:text-[38px] leading-tight text-[var(--ink)] tracking-[-0.025em]">
              {pageHeading.title}
            </h1>
            <span className="font-expressive text-2xl sm:text-[28px] text-[var(--accent)]">
              {pageHeading.countNum}
            </span>
          </div>
          <p className="text-sm text-[var(--muted)]">
            {tab === 'setlists'
              ? 'Monte a sequência do ensaio ou entre direto no Modo Show.'
              : `${pageHeading.countNum} ${pageHeading.countLabel} prontas para ensaio e palco.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tab !== 'setlists' ? (
            <>
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="pill-btn h-10 px-4 text-sm text-[var(--ink)]"
              >
                Importar .cho
              </button>
              <button
                type="button"
                onClick={handleExportAll}
                className="pill-btn h-10 px-4 text-sm text-[var(--muted)]"
              >
                Exportar tudo
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowNewSetlist(true)}
              className="pill-btn pill-btn-primary h-10 px-5 text-sm"
            >
              + Criar setlist
            </button>
          )}
        </div>
      </header>

      {/* Tonal toast */}
      {toastMsg && (
        <div
          role="status"
          className="rounded-2xl bg-[var(--tune-dim)] text-[var(--tune)] px-4 py-3 text-sm font-medium"
        >
          {toastMsg}
        </div>
      )}

      {/* Songs & Favorites */}
      {tab !== 'setlists' && (
        <section className="space-y-4">
          {/* Floating GM3 pill search + filters + Cards/List toggle */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative w-full lg:flex-1 flex items-center h-12 px-4 rounded-full bg-[var(--surface)] focus-within:ring-2 focus-within:ring-[var(--secondary)]/40 transition-shadow">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="text-[var(--muted)] mr-3 flex-shrink-0"
              >
                <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
                <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder={
                  tab === 'favorites'
                    ? 'Buscar favoritas por nome, artista ou tom...'
                    : 'Buscar música, artista ou tom...'
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-[15px] text-[var(--ink)] placeholder-[var(--muted)] outline-none pr-8"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Limpar busca"
                  className="absolute right-2.5 w-8 h-8 rounded-full text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-high)] flex items-center justify-center cursor-pointer text-lg"
                >
                  &times;
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {availableKeys.length > 0 && (
                <div className="relative inline-flex items-center">
                  <select
                    aria-label="Filtrar por tom"
                    value={keyFilter}
                    onChange={(e) => setKeyFilter(e.target.value)}
                    className="appearance-none h-10 pl-4 pr-9 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-high)] text-sm font-medium text-[var(--ink)] outline-none cursor-pointer transition-colors"
                  >
                    <option value="">Todos os tons</option>
                    {availableKeys.map((k) => (
                      <option key={k} value={k}>
                        Tom: {k}
                      </option>
                    ))}
                  </select>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 text-[var(--muted)]"
                  >
                    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              <div className="relative inline-flex items-center">
                <select
                  aria-label="Ordenar músicas"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortMode)}
                  className="appearance-none h-10 pl-4 pr-9 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-high)] text-sm font-medium text-[var(--ink)] outline-none cursor-pointer transition-colors"
                >
                  <option value="title">Nome (A–Z)</option>
                  <option value="rating">Avaliação</option>
                  <option value="favorites">Favoritas</option>
                  <option value="bpm">Andamento (BPM)</option>
                </select>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 text-[var(--muted)]"
                >
                  <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              {/* Cards | Lista segmented pill toggle */}
              <div
                role="group"
                aria-label="Modo de visualização"
                className="inline-flex p-1 rounded-full bg-[var(--surface-high)] h-10 items-center"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  aria-pressed={viewMode === 'cards'}
                  className={`px-3.5 h-8 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-pressed={viewMode === 'list'}
                  className={`px-3.5 h-8 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  Lista
                </button>
              </div>
            </div>
          </div>

          {filteredSongs.length === 0 ? (
            <div className="rounded-[24px] bg-[var(--surface)] px-6 py-16 text-center space-y-4">
              <p className="text-sm text-[var(--muted)]">
                {tab === 'favorites'
                  ? favoriteCount === 0
                    ? 'Nenhuma favorita ainda. Toque no ♡ de qualquer música para fixar aqui.'
                    : 'Nenhuma favorita corresponde aos filtros.'
                  : songs.length === 0
                  ? 'Nenhuma música no repertório ainda.'
                  : 'Nenhuma música corresponde à busca ou ao filtro de tom.'}
              </p>
              {search || keyFilter ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setKeyFilter('');
                  }}
                  className="pill-btn pill-btn-tonal h-10 px-5 text-sm"
                >
                  Limpar filtros
                </button>
              ) : (
                tab === 'all' && (
                  <Link href="/add-song" className="pill-btn pill-btn-primary h-10 px-5 text-sm">
                    + Nova música
                  </Link>
                )
              )}
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5">
              {filteredSongs.map((song) => (
                <SongCard key={song.id} song={song} onRemove={removeEntry} variant="card" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-[2px]">
              {filteredSongs.map((song, idx) => {
                const position =
                  filteredSongs.length === 1
                    ? 'only'
                    : idx === 0
                    ? 'first'
                    : idx === filteredSongs.length - 1
                    ? 'last'
                    : 'middle';
                return (
                  <SongCard
                    key={song.id}
                    song={song}
                    onRemove={removeEntry}
                    variant="list"
                    position={position}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Setlists tonal cards */}
      {tab === 'setlists' && (
        <section className="space-y-4">
          {showNewSetlist && (
            <div className="rounded-[24px] bg-[var(--surface)] p-5 flex flex-wrap gap-3 items-center">
              <input
                autoFocus
                type="text"
                placeholder="Nome do setlist (ex.: Ensaio de Sexta, Show Bar...)"
                value={newSetlistName}
                onChange={(e) => setNewSetlistName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSetlist();
                  if (e.key === 'Escape') {
                    setShowNewSetlist(false);
                    setNewSetlistName('');
                  }
                }}
                className="studio-input flex-1 min-w-[220px] px-4 py-2.5 text-sm"
              />
              <button
                type="button"
                onClick={handleCreateSetlist}
                disabled={!newSetlistName.trim()}
                className="pill-btn pill-btn-primary h-10 px-5 text-sm"
              >
                Criar setlist
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewSetlist(false);
                  setNewSetlistName('');
                }}
                className="pill-btn bg-[var(--bg)] h-10 px-4 text-sm"
              >
                Cancelar
              </button>
            </div>
          )}

          {setlists.length === 0 && !showNewSetlist ? (
            <div className="rounded-[24px] bg-[var(--surface)] px-6 py-16 text-center space-y-4">
              <p className="text-sm text-[var(--muted)]">
                Nenhum setlist criado ainda. Monte um para organizar a ordem do ensaio ou do show.
              </p>
              <button
                type="button"
                onClick={() => setShowNewSetlist(true)}
                className="pill-btn pill-btn-primary h-10 px-5 text-sm"
              >
                + Criar primeiro setlist
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {setlists.map((sl) => {
                const validSongs = sl.songIds
                  .map((sid) => songs.find((s) => s.id === sid))
                  .filter((s): s is (typeof songs)[number] => s !== undefined);
                const firstSongId = validSongs[0]?.id ?? null;
                const durSummary = validSongs.length > 0 ? computeSetlistDuration(validSongs) : null;
                const durLabel = durSummary
                  ? formatSetlistDuration(durSummary.totalSec, durSummary.estimatedCount > 0)
                  : null;
                const isEmpty = validSongs.length === 0;

                return (
                  <article
                    key={sl.id}
                    className={`group rounded-[20px] px-5 py-5 flex flex-col justify-between gap-4 transition-colors ${
                      isEmpty
                        ? 'bg-[var(--surface2)] hover:bg-[var(--surface-high)]'
                        : 'bg-[var(--surface)] hover:bg-[var(--surface-high)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/setlists/${sl.id}`} className="min-w-0 flex-1">
                        <h3 className="font-display text-[20px] font-bold leading-snug text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors truncate">
                          {sl.name}
                        </h3>
                        <p className="text-xs text-[var(--muted)] mt-1">
                          {validSongs.length} {validSongs.length === 1 ? 'música' : 'músicas'}
                          {durLabel ? ` · ${durLabel}` : ''}
                        </p>
                      </Link>

                      <div className="flex items-center gap-1">
                        <span className="font-expressive text-2xl text-[var(--accent)] pr-1">
                          {validSongs.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSetlistToDelete({ id: sl.id, name: sl.name })}
                          className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--rec)] hover:bg-[var(--surface2)] transition-colors cursor-pointer text-lg"
                          title="Excluir setlist"
                          aria-label={`Excluir setlist ${sl.name}`}
                        >
                          &times;
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/setlists/${sl.id}`}
                        className="pill-btn bg-[var(--bg)] h-9 px-4 text-xs"
                      >
                        Abrir sequência
                      </Link>

                      {firstSongId && (
                        <Link
                          href={`/song/${firstSongId}?setlist=${sl.id}&show=1`}
                          className="pill-btn pill-btn-rec h-9 px-4 text-xs"
                          title="Abrir este setlist direto no Modo Show"
                        >
                          ▶ Modo Show
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Import .cho modal */}
      {showImport && (
        <div
          className="fixed inset-0 bg-black/45 z-[70] flex items-center justify-center p-4"
          onClick={() => {
            setShowImport(false);
            setImportMsg('');
            setImportText('');
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-[var(--surface)] rounded-[28px] w-full max-w-2xl flex flex-col overflow-hidden"
            style={{ boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <div>
                <div className="field-label">Arquivo ChordPro</div>
                <h3 className="font-display text-xl text-[var(--ink)] mt-0.5">Importar .cho</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowImport(false);
                  setImportMsg('');
                  setImportText('');
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer text-lg"
                aria-label="Fechar"
              >
                &times;
              </button>
            </div>
            <div className="px-6 pb-6 space-y-4">
              <p className="text-sm text-[var(--muted)] leading-relaxed">
                Cole um arquivo ChordPro começando com{' '}
                <code className="font-mono text-[var(--accent-ink)]">{'{title: ...}'}</code>. Para importar várias músicas de uma vez, separe com{' '}
                <code className="font-mono text-[var(--ink)]">---</code> numa linha isolada.
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={11}
                placeholder={`{title: Minha Música}\n{artist: Nome do Artista}\n{key: Am}\n\n[Verse 1]\n[Am]Letra aqui`}
                className="studio-input w-full px-4 py-3 font-mono text-xs resize-y"
              />
              {importMsg && (
                <div
                  className={`text-xs font-medium rounded-2xl px-4 py-2.5 ${
                    importMsg.includes('sucesso')
                      ? 'bg-[var(--tune-dim)] text-[var(--tune)]'
                      : 'bg-[var(--rec-dim)] text-[var(--on-rec-container)]'
                  }`}
                >
                  {importMsg}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowImport(false);
                    setImportMsg('');
                    setImportText('');
                  }}
                  className="pill-btn bg-[var(--bg)] h-10 px-5 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  className="pill-btn pill-btn-primary h-10 px-5 text-sm"
                >
                  Importar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!setlistToDelete}
        title="Excluir setlist?"
        description={
          setlistToDelete ? (
            <>
              O setlist &ldquo;{setlistToDelete.name}&rdquo; será apagado. As músicas continuam salvas no repertório.
            </>
          ) : null
        }
        confirmLabel="Excluir"
        danger
        onConfirm={() => {
          if (setlistToDelete) deleteSetlist(setlistToDelete.id);
          setSetlistToDelete(null);
        }}
        onCancel={() => setSetlistToDelete(null)}
      />
    </main>
  );
}
