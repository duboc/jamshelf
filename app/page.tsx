'use client';

import { Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { SongCard } from '@/components/song-list/SongCard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { computeSetlistDuration, formatSetlistDuration } from '@/lib/utils/autoscroll';
import { normalizeSearch } from '@/lib/utils/music';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';
import {
  ChevronDownIcon,
  CloseIcon,
  MoreVertIcon,
  MusicNoteIcon,
  PlayIcon,
  PlusIcon,
} from '@/components/ui/Icons';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

type Tab = 'all' | 'favorites' | 'setlists';
type SortMode = 'title' | 'rating' | 'bpm' | 'favorites';

function isTab(value: string | null): value is Tab {
  return value === 'all' || value === 'favorites' || value === 'setlists';
}

function SetlistCardMenu({
  setlistName,
  onDelete,
}: {
  setlistName: string;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Mais ações para ${setlistName}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="gm3-icon-btn w-10 h-10 flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] cursor-pointer"
      >
        <MoreVertIcon size={18} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`Menu do setlist ${setlistName}`}
          className="gm3-card gm3-popover-top-right absolute right-0 top-[calc(100%+6px)] z-30 w-44 rounded-[20px] bg-[var(--surface)] p-1.5"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="gm3-menu-item w-full text-left px-3 py-2 text-[13px] font-medium text-[var(--rec)] hover:bg-[var(--rec-dim)]/50 cursor-pointer"
          >
            Excluir setlist
          </button>
        </div>
      )}
    </div>
  );
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
  const songsLoaded = useSongStore((s) => s.isLoaded);
  const { getSongs, removeEntry, exportAll, importEntriesDetailed } = useSongStore();
  const { setlists, isLoaded: setlistsLoaded, createSetlist, deleteSetlist } = useSetlistStore();
  const { viewMode, setViewMode } = useDisplayStore();
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
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [newSetlistName, setNewSetlistName] = useState('');
  const [showNewSetlist, setShowNewSetlist] = useState(false);
  const [setlistToDelete, setSetlistToDelete] = useState<{ id: string; name: string } | null>(null);
  const importDialogRef = useRef<HTMLDivElement>(null);
  const importTitleId = useId();
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeImport = () => {
    setShowImport(false);
    setImportMsg('');
    setImportText('');
  };

  useDialogA11y(showImport, closeImport, importDialogRef);

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
    const q = normalizeSearch(search);

    const matched = base.filter((s) => {
      if (keyFilter && s.displayKey !== keyFilter) return false;
      if (!q) return true;
      return (
        normalizeSearch(s.title).includes(q) ||
        normalizeSearch(s.artist).includes(q) ||
        normalizeSearch(s.displayKey).includes(q)
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
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(''), 4800);
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
    const { imported, skipped } = importEntriesDetailed(importText.trim());
    if (imported > 0) {
      const base =
        imported === 1
          ? '1 música importada com sucesso'
          : `${imported} músicas importadas com sucesso`;
      const skippedNote =
        skipped > 0
          ? ` (${skipped} ${skipped === 1 ? 'bloco ignorado' : 'blocos ignorados'} por falta de {title: ...})`
          : '';
      setImportMsg(`${base}${skippedNote}.`);
      setImportText('');
      setTimeout(() => {
        closeImport();
      }, 1500);
    } else {
      setImportMsg('Não foi possível ler o ChordPro. Confira se o texto começa com {title: ...}.');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportText(text);
    setImportMsg('');
    e.target.value = '';
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
          subtitle: 'Suas músicas marcadas com coração para acesso rápido.',
        }
      : tab === 'setlists'
      ? {
          title: 'Setlists',
          countNum: setlists.length,
          subtitle: 'Monte a sequência do ensaio ou entre direto no Modo Show.',
        }
      : {
          title: 'Repertório',
          countNum: songs.length,
          subtitle: 'Cifras e letras prontas para ensaio e palco.',
        };

  return (
    <main
      id="main-content"
      className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6"
    >
      {/* Expressive GM3 Page Header directly on the #F0F4F9 canvas */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-[32px] sm:text-[38px] leading-tight text-[var(--ink)] tracking-[-0.025em]">
              {pageHeading.title}
            </h1>
            <span className="font-expressive text-2xl sm:text-[28px] text-[var(--muted)]">
              {pageHeading.countNum}
            </span>
          </div>
          <p className="text-sm text-[var(--muted)]">{pageHeading.subtitle}</p>
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
                className="pill-btn h-10 px-4 text-sm text-[var(--ink)]"
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
              <PlusIcon size={16} />
              Criar setlist
            </button>
          )}
        </div>
      </header>

      {/* Tonal toast */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="gm3-panel-enter rounded-2xl bg-[var(--tune-dim)] text-[var(--tune)] px-4 py-3 text-sm font-medium flex items-center justify-between gap-3"
        >
          <span>{toastMsg}</span>
          <button
            type="button"
            onClick={() => setToastMsg('')}
            aria-label="Fechar aviso"
            className="gm3-icon-btn w-8 h-8 flex items-center justify-center hover:bg-black/10 cursor-pointer flex-shrink-0"
          >
            <CloseIcon size={15} />
          </button>
        </div>
      )}

      {/* Songs & Favorites */}
      {tab !== 'setlists' && (
        <section key={tab} className="gm3-page-enter space-y-4">
          {/* Floating GM3 pill search + filters + Cards/List toggle */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="gm3-search-pill relative w-full lg:flex-1 flex items-center h-12 px-4 bg-[var(--surface)] focus-within:ring-2 focus-within:ring-[var(--secondary)]/50">
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
                aria-label={
                  tab === 'favorites'
                    ? 'Buscar favoritas por nome, artista ou tom'
                    : 'Buscar música, artista ou tom'
                }
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
                  className="gm3-icon-btn absolute right-2.5 w-8 h-8 text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-high)] flex items-center justify-center cursor-pointer"
                >
                  <CloseIcon size={16} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {availableKeys.length > 0 && (
                <div className="relative inline-flex items-center">
                  <select
                    aria-label="Filtrar por tom"
                    value={keyFilter}
                    data-active={keyFilter ? 'true' : undefined}
                    onChange={(e) => setKeyFilter(e.target.value)}
                    className="gm3-select appearance-none h-10 pl-4 pr-9 text-sm font-medium cursor-pointer"
                  >
                    <option value="">Todos os tons</option>
                    {availableKeys.map((k) => (
                      <option key={k} value={k}>
                        Tom: {k}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    size={14}
                    className={`pointer-events-none absolute right-3 ${
                      keyFilter ? 'text-[var(--on-secondary-container)]' : 'text-[var(--muted)]'
                    }`}
                  />
                </div>
              )}

              <div className="relative inline-flex items-center">
                <select
                  aria-label="Ordenar músicas"
                  value={sortBy}
                  data-active={sortBy !== 'title' ? 'true' : undefined}
                  onChange={(e) => setSortBy(e.target.value as SortMode)}
                  className="gm3-select appearance-none h-10 pl-4 pr-9 text-sm font-medium cursor-pointer"
                >
                  <option value="title">Nome (A-Z)</option>
                  <option value="rating">Avaliação</option>
                  <option value="favorites">Favoritas</option>
                  <option value="bpm">Andamento (BPM)</option>
                </select>
                <ChevronDownIcon
                  size={14}
                  className={`pointer-events-none absolute right-3 ${
                    sortBy !== 'title' ? 'text-[var(--on-secondary-container)]' : 'text-[var(--muted)]'
                  }`}
                />
              </div>

              {/* Cards | Lista M3 Expressive Connected Button Group */}
              <div
                role="group"
                aria-label="Modo de visualização"
                className="gm3-connected-group"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  aria-pressed={viewMode === 'cards'}
                  className="gm3-connected-btn px-4 h-10 text-xs font-medium cursor-pointer"
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-pressed={viewMode === 'list'}
                  className="gm3-connected-btn px-4 h-10 text-xs font-medium cursor-pointer"
                >
                  Lista
                </button>
              </div>
            </div>
          </div>

          {!songsLoaded && songs.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5" aria-busy="true">
              {Array.from({ length: 8 }, (_, idx) => (
                <div key={idx} className="gm3-skeleton h-32 rounded-[20px]" />
              ))}
            </div>
          ) : filteredSongs.length === 0 ? (
            <div className="gm3-card rounded-[24px] bg-[var(--surface)] px-6 py-16 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[var(--primary-container)] text-[var(--on-primary-container)] flex items-center justify-center">
                <MusicNoteIcon size={22} />
              </div>
              <h2 className="font-display text-lg font-bold text-[var(--ink)]">
                {search || keyFilter
                  ? 'Nenhuma música encontrada'
                  : tab === 'favorites'
                  ? 'Nenhuma favorita ainda'
                  : 'Seu repertório está vazio'}
              </h2>
              <p className="text-sm text-[var(--muted)] max-w-md">
                {tab === 'favorites'
                  ? favoriteCount === 0
                    ? 'Toque no coração de qualquer música para fixar aqui e abrir mais rápido no ensaio.'
                    : 'Nenhuma favorita corresponde aos filtros atuais.'
                  : songs.length === 0
                  ? 'Adicione sua primeira cifra com IA ou importe um arquivo .cho.'
                  : 'Ajuste o texto buscado ou limpe o filtro de tom para ver todo o repertório.'}
              </p>
              {search || keyFilter ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setKeyFilter('');
                  }}
                  className="pill-btn pill-btn-tonal h-10 px-5 text-sm mt-1"
                >
                  Limpar filtros
                </button>
              ) : (
                tab === 'all' && (
                  <Link href="/add-song" className="pill-btn pill-btn-primary h-10 px-5 text-sm mt-1">
                    <PlusIcon size={16} />
                    Nova música
                  </Link>
                )
              )}
            </div>
          ) : viewMode === 'cards' ? (
            <div key="cards" className="gm3-view-enter grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5">
              {filteredSongs.map((song) => (
                <SongCard key={song.id} song={song} onRemove={removeEntry} variant="card" />
              ))}
            </div>
          ) : (
            <div key="list" className="gm3-view-enter flex flex-col gap-[2px]">
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
        <section key="setlists" className="gm3-page-enter space-y-4">
          {showNewSetlist && (
            <div className="gm3-card gm3-panel-enter rounded-[24px] bg-[var(--surface)] p-5 flex flex-wrap gap-3 items-center">
              <input
                autoFocus
                type="text"
                aria-label="Nome do novo setlist"
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

          {!setlistsLoaded && setlists.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5" aria-busy="true">
              {Array.from({ length: 3 }, (_, idx) => (
                <div key={idx} className="gm3-skeleton h-36 rounded-[20px]" />
              ))}
            </div>
          ) : setlists.length === 0 && !showNewSetlist ? (
            <div className="gm3-card rounded-[24px] bg-[var(--surface)] px-6 py-16 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[var(--primary-container)] text-[var(--on-primary-container)] flex items-center justify-center">
                <MusicNoteIcon size={22} />
              </div>
              <h2 className="font-display text-lg font-bold text-[var(--ink)]">Nenhum setlist criado ainda</h2>
              <p className="text-sm text-[var(--muted)] max-w-md">
                Organize a ordem das músicas do ensaio ou do show e acompanhe o tempo total da apresentação.
              </p>
              <button
                type="button"
                onClick={() => setShowNewSetlist(true)}
                className="pill-btn pill-btn-primary h-10 px-5 text-sm mt-1"
              >
                <PlusIcon size={16} />
                Criar primeiro setlist
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
                    className={`gm3-card gm3-card-interactive group px-5 py-5 flex flex-col justify-between gap-4 ${
                      isEmpty
                        ? 'bg-[var(--surface2)] hover:bg-[var(--surface-high)]'
                        : 'bg-[var(--surface)] hover:bg-[var(--surface-high)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/setlists/${sl.id}`} className="min-w-0 flex-1">
                        <h2 className="font-display text-[20px] font-bold leading-snug text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors truncate">
                          {sl.name}
                        </h2>
                        <p className="text-xs text-[var(--muted)] mt-1 font-mono tabular-nums">
                          {validSongs.length} {validSongs.length === 1 ? 'música' : 'músicas'}
                          {durLabel ? ` · ${durLabel}` : ''}
                        </p>
                      </Link>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="font-expressive text-2xl text-[var(--muted)] pr-1">
                          {validSongs.length}
                        </span>
                        <SetlistCardMenu
                          setlistName={sl.name}
                          onDelete={() => setSetlistToDelete({ id: sl.id, name: sl.name })}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/setlists/${sl.id}`}
                        className={`pill-btn h-10 px-4 text-xs ${
                          isEmpty ? 'bg-[var(--surface)]' : 'bg-[var(--surface-high)]'
                        }`}
                      >
                        Abrir sequência
                      </Link>

                      {firstSongId && (
                        <Link
                          href={`/song/${firstSongId}?setlist=${sl.id}&show=1`}
                          className="pill-btn bg-[var(--rec-dim)] text-[var(--on-rec-container)] hover:bg-[var(--rec-fill)] hover:text-[var(--on-rec-fill)] h-10 px-4 text-xs"
                          title="Abrir este setlist direto no Modo Show"
                        >
                          <PlayIcon size={13} />
                          Modo Show
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
          className="gm3-backdrop-enter fixed inset-0 bg-black/45 z-[70] flex items-center justify-center p-4"
          onClick={closeImport}
        >
          <div
            ref={importDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={importTitleId}
            className="gm3-card gm3-dialog-enter bg-[var(--surface)] rounded-[28px] w-full max-w-2xl flex flex-col overflow-hidden"
            style={{ boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <div>
                <div className="field-label">Arquivo ChordPro</div>
                <h2 id={importTitleId} className="font-display text-xl font-bold text-[var(--ink)] mt-0.5">
                  Importar .cho
                </h2>
              </div>
              <button
                type="button"
                onClick={closeImport}
                className="gm3-icon-btn w-10 h-10 flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer"
                aria-label="Fechar"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="px-6 pb-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-[var(--muted)] leading-relaxed flex-1">
                  Cole um arquivo ChordPro começando com{' '}
                  <code className="font-mono text-[var(--accent-ink)]">{'{title: ...}'}</code>. Para importar várias músicas, separe com{' '}
                  <code className="font-mono text-[var(--ink)]">---</code> numa linha isolada.
                </p>
                <label className="pill-btn bg-[var(--bg)] h-9 px-3.5 text-xs cursor-pointer flex-shrink-0">
                  Carregar arquivo .cho
                  <input
                    type="file"
                    accept=".cho,.chordpro,.txt,text/plain"
                    onChange={handleImportFile}
                    className="sr-only"
                  />
                </label>
              </div>
              <textarea
                aria-label="Conteúdo ChordPro para importar"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={11}
                placeholder={`{title: Minha Música}\n{artist: Nome do Artista}\n{key: Am}\n\n[Verse 1]\n[Am]Letra aqui`}
                className="studio-input w-full px-4 py-3 font-mono text-xs resize-y"
              />
              {importMsg && (
                <div
                  role={importMsg.includes('sucesso') ? 'status' : 'alert'}
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
                  onClick={closeImport}
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
