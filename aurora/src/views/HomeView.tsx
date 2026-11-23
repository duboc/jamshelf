import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ParsedSong } from '@/lib/types/song';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { computeSetlistDuration, formatSetlistDuration } from '@/lib/utils/autoscroll';
import { formatDuration } from '@/lib/utils/chordpro-parser';
import { isMinorKey, normalizeSearch } from '@/lib/utils/music';
import {
  AuroraButton,
  AuroraChip,
  AuroraCollapsible,
  AuroraDialog,
  AuroraIconButton,
  AuroraSegmented,
  AuroraSheet,
  UiIcon,
  copyText,
} from '../aurora/primitives';
import { getDisplayTitleAndArtist, getEffectiveKey } from '../utils/song-display';
import { AuroraLink, navigate, useRoute } from '../router';

type HomeTab = 'all' | 'favorites' | 'setlists';
type SortMode = 'title' | 'rating' | 'favorites' | 'bpm';

function SongCardItem({
  song,
  index,
  variant,
  itemRef,
  onOpenActions,
  onToggleFavorite,
}: {
  song: ParsedSong;
  index: number;
  variant: 'cards' | 'list';
  itemRef?: (el: HTMLElement | null) => void;
  onOpenActions: (song: ParsedSong) => void;
  onToggleFavorite: (song: ParsedSong) => void;
}) {
  const { title, artist, incomplete } = getDisplayTitleAndArtist(song);
  const { key: effectiveKey, estimated } = getEffectiveKey(song);
  const minor = isMinorKey(effectiveKey);
  const metaParts: string[] = [];
  if (song.tempo) metaParts.push(`${song.tempo}\u00A0BPM`);
  if (song.duration) metaParts.push(formatDuration(song.duration));
  if (song.capo > 0) metaParts.push(`Capo\u00A0${song.capo}`);
  const staggerStyle =
    index < 8 ? ({ '--stagger-i': index } as CSSProperties) : undefined;
  const linkAriaLabel = [
    title,
    artist || 'Sem artista',
    effectiveKey ? `Tom ${effectiveKey}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  if (variant === 'list') {
    return (
      <article
        ref={itemRef}
        style={staggerStyle}
        className={`${index < 8 ? 'stagger-item ' : ''}stage-card stage-card-interactive px-4 py-3 flex items-center justify-between gap-3`}
      >
        <AuroraLink
          href={`/song/${song.id}`}
          aria-label={linkAriaLabel}
          className="min-w-0 flex-1 flex items-center gap-3.5 no-underline text-on-surface after:absolute after:inset-0"
        >
          <span
            className={`card-key-badge w-10 h-10 rounded-xl flex items-center justify-center font-mono typescale-label-lg flex-shrink-0 ${
              !effectiveKey
                ? 'bg-surface-container-high text-on-surface-variant'
                : minor
                  ? 'bg-minor-bg text-minor-ink'
                  : 'bg-primary-container text-on-primary-container'
            }`}
          >
            {effectiveKey || '-'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="typescale-emphasized-title-md text-on-surface m-0 truncate">
                {title}
              </h2>
              {incomplete && (
                <span className="px-2 py-0.5 rounded-full bg-warn-bg text-warn-ink typescale-label-sm flex-shrink-0">
                  Incompleta
                </span>
              )}
            </div>
            <p className="typescale-body-sm text-on-surface-variant m-0 truncate">
              <span>{artist || 'Sem artista'}</span>
              {metaParts.length > 0 && (
                <span className="md:hidden font-mono tabular-nums"> · {metaParts.join(' · ')}</span>
              )}
            </p>
          </div>
        </AuroraLink>

        <div className="relative z-10 flex items-center gap-0.5 -mr-2 flex-shrink-0">
          {metaParts.length > 0 && (
            <span className="hidden md:inline-flex items-center font-mono tabular-nums typescale-body-sm text-on-surface-variant mr-2">
              {metaParts.join(' · ')}
            </span>
          )}
          {song.rating > 0 && (
            <span
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-warn-bg text-warn-ink typescale-label-sm mr-1 tabular-nums"
              aria-label={`Avaliação ${song.rating} de 5`}
            >
              <UiIcon name="star" size={20} filled className="text-warn-icon" />
              <span>{song.rating}</span>
            </span>
          )}
          <AuroraIconButton
            icon="favorite"
            filled={song.favorite}
            label={song.favorite ? `Remover ${title} das favoritas` : `Favoritar ${title}`}
            className={song.favorite ? 'text-error' : ''}
            onClick={() => onToggleFavorite(song)}
          />
          <AuroraIconButton
            icon="more_vert"
            label={`Mais ações para ${title}`}
            onClick={() => onOpenActions(song)}
          />
        </div>
      </article>
    );
  }

  return (
    <article
      ref={itemRef}
      style={staggerStyle}
      className={`${index < 8 ? 'stagger-item ' : ''}stage-card stage-card-interactive p-4 flex flex-col justify-between gap-3`}
    >
      <div className="flex items-start justify-between gap-3">
        <AuroraLink
          href={`/song/${song.id}`}
          aria-label={linkAriaLabel}
          className="min-w-0 flex-1 no-underline text-on-surface after:absolute after:inset-0"
        >
          <h2 className="typescale-emphasized-title-md text-on-surface m-0 line-clamp-2">
            {title}
          </h2>
          <p className="typescale-body-sm text-on-surface-variant mt-1 mb-0 truncate">
            {artist || 'Sem artista'}
          </p>
        </AuroraLink>

        {effectiveKey ? (
          <span
            aria-hidden="true"
            className={`card-key-badge h-8 min-w-[38px] px-2.5 rounded-xl inline-flex items-center justify-center font-mono typescale-label-lg flex-shrink-0 ${
              minor
                ? 'bg-minor-bg text-minor-ink'
                : 'bg-primary-container text-on-primary-container'
            }`}
            title={estimated ? `Tom estimado ${effectiveKey}` : `Tom ${effectiveKey}`}
          >
            {effectiveKey}
          </span>
        ) : incomplete ? (
          <span className="px-2.5 py-1 rounded-full bg-warn-bg text-warn-ink typescale-label-sm flex-shrink-0">
            Incompleta
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="min-w-0 flex items-center gap-2 flex-wrap">
          <span className="typescale-body-sm text-on-surface-variant font-mono tabular-nums whitespace-normal">
            {metaParts.join(' · ') || '4/4'}
          </span>
          {song.rating > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-warn-ink typescale-label-sm tabular-nums"
              aria-label={`Avaliação ${song.rating} de 5`}
            >
              <UiIcon name="star" size={20} filled className="text-warn-icon" />
              <span>{song.rating}</span>
            </span>
          )}
        </div>

        <div className="relative z-10 flex items-center -mr-2.5 -my-2">
          <AuroraIconButton
            icon="favorite"
            filled={song.favorite}
            label={song.favorite ? `Remover ${title} das favoritas` : `Favoritar ${title}`}
            className={song.favorite ? 'text-error' : ''}
            onClick={() => onToggleFavorite(song)}
          />
          <AuroraIconButton
            icon="more_vert"
            label={`Mais ações para ${title}`}
            onClick={() => onOpenActions(song)}
          />
        </div>
      </div>
    </article>
  );
}

export function HomeView() {
  const route = useRoute();
  const entries = useSongStore((s) => s.entries);
  const songsLoaded = useSongStore((s) => s.isLoaded);
  const { getSongs, patchMeta, removeEntry, exportAll, importEntriesDetailed } = useSongStore();
  const {
    setlists,
    isLoaded: setlistsLoaded,
    createSetlist,
    deleteSetlist,
    addSongToSetlist,
  } = useSetlistStore();
  const { viewMode, setViewMode } = useDisplayStore();

  const tabParam = route.params.get('tab');
  const tab: HomeTab =
    tabParam === 'favorites' || tabParam === 'setlists' ? tabParam : 'all';

  const [search, setSearch] = useState('');
  const [keyFilter, setKeyFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortMode>('title');
  const [actionSong, setActionSong] = useState<ParsedSong | null>(null);
  const [deleteSongTarget, setDeleteSongTarget] = useState<ParsedSong | null>(null);
  const [deleteSetlistTarget, setDeleteSetlistTarget] = useState<{ id: string; name: string } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showLibraryMenu, setShowLibraryMenu] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [showNewSetlist, setShowNewSetlist] = useState(false);
  const [newSetlistName, setNewSetlistName] = useState('');
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const newSetlistInputRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const prevCardRectsRef = useRef<Map<string, DOMRect> | null>(null);

  const snapshotCards = () => {
    if (
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      prevCardRectsRef.current = null;
      return;
    }
    const snap = new Map<string, DOMRect>();
    let count = 0;
    cardRefs.current.forEach((el, id) => {
      if (count < 20) {
        snap.set(id, el.getBoundingClientRect());
        count += 1;
      }
    });
    prevCardRectsRef.current = snap;
  };

  useLayoutEffect(() => {
    const prev = prevCardRectsRef.current;
    prevCardRectsRef.current = null;
    if (!prev || prev.size === 0) return;

    const moves: { el: HTMLElement; dx: number; dy: number }[] = [];
    cardRefs.current.forEach((el, id) => {
      const oldRect = prev.get(id);
      if (!oldRect) return;
      const nextRect = el.getBoundingClientRect();
      const dx = oldRect.left - nextRect.left;
      const dy = oldRect.top - nextRect.top;
      if (Math.hypot(dx, dy) > 1 && Math.hypot(dx, dy) <= 520) {
        moves.push({ el, dx, dy });
      }
    });
    if (moves.length === 0) return;

    moves.forEach(({ el, dx, dy }) => {
      el.style.transition = 'none';
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    });
    void document.body.offsetHeight;
    moves.forEach(({ el }) => {
      el.style.transition = '';
      el.style.transform = '';
    });
  }, [sortBy, keyFilter]);

  useEffect(() => {
    if (showNewSetlist) {
      window.setTimeout(() => newSetlistInputRef.current?.focus(), 60);
    }
  }, [showNewSetlist]);

  useEffect(() => {
    if (tab === 'favorites' && sortBy === 'favorites') {
      setSortBy('title');
    }
  }, [tab, sortBy]);

  const notify = (msg: string) => {
    setToast({ id: Date.now(), msg });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  };

  const songs = useMemo(() => {
    void entries;
    return getSongs();
  }, [entries, getSongs]);

  const favoriteCount = useMemo(() => songs.filter((s) => s.favorite).length, [songs]);

  const { availableKeys, hasUnkeyed } = useMemo(() => {
    const scopeSongs = tab === 'favorites' ? songs.filter((s) => s.favorite) : songs;
    const keys = new Set<string>();
    let missing = false;
    scopeSongs.forEach((s) => {
      const k = getEffectiveKey(s).key;
      if (k) keys.add(k);
      else missing = true;
    });
    return {
      availableKeys: [...keys].sort((a, b) => a.localeCompare(b)),
      hasUnkeyed: missing,
    };
  }, [songs, tab]);

  useEffect(() => {
    if (!keyFilter) return;
    if (keyFilter === '__none__' && !hasUnkeyed) {
      setKeyFilter('');
    } else if (keyFilter !== '__none__' && !availableKeys.includes(keyFilter)) {
      setKeyFilter('');
    }
  }, [tab, keyFilter, availableKeys, hasUnkeyed]);

  const filteredSongs = useMemo(() => {
    const base = tab === 'favorites' ? songs.filter((s) => s.favorite) : songs;
    const q = normalizeSearch(search);
    const matched = base.filter((s) => {
      const effKey = getEffectiveKey(s).key;
      if (keyFilter === '__none__' && effKey) return false;
      if (keyFilter && keyFilter !== '__none__' && effKey !== keyFilter) return false;
      if (!q) return true;
      const { title, artist } = getDisplayTitleAndArtist(s);
      return (
        normalizeSearch(title).includes(q) ||
        normalizeSearch(artist).includes(q) ||
        normalizeSearch(effKey).includes(q)
      );
    });

    return [...matched].sort((a, b) => {
      const ta = getDisplayTitleAndArtist(a).title;
      const tb = getDisplayTitleAndArtist(b).title;
      if (sortBy === 'rating') return b.rating - a.rating || ta.localeCompare(tb);
      if (sortBy === 'bpm') return b.tempo - a.tempo || ta.localeCompare(tb);
      if (sortBy === 'favorites') {
        return Number(b.favorite) - Number(a.favorite) || ta.localeCompare(tb);
      }
      return ta.localeCompare(tb);
    });
  }, [songs, tab, search, keyFilter, sortBy]);

  const handleExportAll = async () => {
    const ok = await copyText(exportAll());
    notify(
      ok
        ? 'Todas as músicas foram copiadas em formato ChordPro (.cho).'
        : 'Não foi possível copiar para a área de transferência.'
    );
  };

  const handleImport = () => {
    if (!importText.trim()) {
      setImportMsg('Cole o conteúdo ChordPro antes de importar.');
      return;
    }
    const { imported, skipped } = importEntriesDetailed(importText.trim());
    if (imported > 0) {
      const msg =
        imported === 1
          ? '1 música importada com sucesso.'
          : `${imported} músicas importadas com sucesso.`;
      setImportMsg(skipped > 0 ? `${msg} (${skipped} bloco(s) ignorados.)` : msg);
      setImportText('');
      window.setTimeout(() => {
        setShowImport(false);
        setImportMsg('');
      }, 1200);
    } else {
      setImportMsg('Formato não reconhecido. Confira se o texto começa com {title: ...}.');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportText(await file.text());
    setImportMsg('');
    e.target.value = '';
  };

  const handleCreateSetlist = () => {
    const name = newSetlistName.trim();
    if (!name) return;
    const sl = createSetlist(name);
    setNewSetlistName('');
    setShowNewSetlist(false);
    navigate(`/setlists/${sl.id}`);
  };

  const heading =
    tab === 'favorites'
      ? {
          title: 'Favoritas',
          count: favoriteCount,
          subtitle: 'Músicas marcadas para acesso imediato no ensaio.',
        }
      : tab === 'setlists'
        ? {
            title: 'Setlists',
            count: setlists.length,
            subtitle: 'Organize a sequência da banda e abra direto em Slides ou Modo show.',
          }
        : {
            title: 'Repertório',
            count: songs.length,
            subtitle: 'Cifras, letras e setlists prontos para ensaio e palco.',
          };

  const currentActionSong = actionSong ? songs.find((s) => s.id === actionSong.id) ?? actionSong : null;
  const isFiltered = Boolean(search.trim() || keyFilter);
  const sortOptions: { value: SortMode; label: string }[] =
    tab === 'favorites'
      ? [
          { value: 'title', label: 'A-Z' },
          { value: 'rating', label: 'Estrelas' },
          { value: 'bpm', label: 'BPM' },
        ]
      : [
          { value: 'title', label: 'A-Z' },
          { value: 'rating', label: 'Estrelas' },
          { value: 'favorites', label: 'Favoritas' },
          { value: 'bpm', label: 'BPM' },
        ];

  useEffect(() => {
    document.title = `${heading.title} - Jamshelf`;
  }, [heading.title]);

  return (
    <main id="main" tabIndex={-1} className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 md:pb-8 space-y-5 focus:outline-none">
      {/* Clean focused page header */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 sm:gap-x-3 gap-y-2">
        <div className="space-y-1 min-w-0 sm:flex-1 sm:min-w-[240px]">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <h1 className="typescale-title-lg sm:typescale-display-sm text-on-surface m-0">
              {heading.title}
            </h1>
            <span
              key={tab !== 'setlists' && isFiltered ? filteredSongs.length : heading.count}
              className="chord-settle px-2 sm:px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant typescale-label-sm font-mono tabular-nums flex-shrink-0"
            >
              {tab !== 'setlists' && isFiltered
                ? `${filteredSongs.length}/${heading.count}`
                : heading.count}
            </span>
          </div>
          <p className="hidden sm:block typescale-body-md text-on-surface-variant m-0">
            {heading.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          {tab !== 'setlists' ? (
            <>
              <AuroraLink
                href="/add-song"
                className="md:hidden stage-btn stage-btn-primary-tonal typescale-label-lg px-2.5 gap-1 no-underline"
              >
                <UiIcon name="add" size={20} />
                <span>Nova</span>
              </AuroraLink>
              <div className="hidden sm:flex items-center gap-2">
                <AuroraButton color="outlined" icon="upload_file" onClick={() => setShowImport(true)}>
                  Importar .cho
                </AuroraButton>
                <AuroraButton color="outlined" icon="content_copy" onClick={() => void handleExportAll()}>
                  Copiar tudo
                </AuroraButton>
              </div>
              <AuroraIconButton
                icon="more_vert"
                label="Importar ou copiar repertório"
                onClick={() => setShowLibraryMenu(true)}
                className="sm:hidden -mr-2.5"
              />
            </>
          ) : (
            <AuroraButton
              color="primary-tonal"
              icon="add"
              aria-expanded={showNewSetlist}
              onClick={() => setShowNewSetlist((v) => !v)}
            >
              Criar setlist
            </AuroraButton>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            style={{ boxShadow: 'var(--ui-elevation-overlay)' }}
            className="dock-enter-bottom inverse-snackbar pointer-events-auto w-full max-w-md rounded-2xl bg-inverse-surface text-inverse-on-surface px-4 py-2.5 flex items-center justify-between gap-3"
          >
            <span className="typescale-body-md">{toast.msg}</span>
            <AuroraIconButton
              icon="close"
              label="Fechar notificação"
              className="text-inverse-on-surface"
              onClick={() => setToast(null)}
            />
          </div>
        </div>
      )}

      {/* Top-level crossfade wrapper across Repertório / Favoritas / Setlists */}
      <div key={tab} data-transition="top-level" className="view-enter space-y-4">
        {/* Repertório & Favoritas: straight to search, key chips, and songs */}
        {tab !== 'setlists' && (
          <section aria-label="Lista de músicas" className="@container space-y-3.5">
            <div className="flex flex-col @[820px]:flex-row @[820px]:items-center gap-2.5">
              <div className="relative flex-1 flex items-center rounded-full bg-surface border border-outline focus-within:border-primary focus-within:ring-2 focus-within:ring-primary px-4 min-h-[44px] transition-colors">
                <UiIcon name="search" size={20} className="text-on-surface-variant mr-2.5" />
                <label htmlFor="library-filter-input" className="sr-only">
                  Filtrar repertório por título, artista ou tom
                </label>
                <input
                  id="library-filter-input"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    tab === 'favorites'
                      ? 'Buscar favoritas por música, artista ou tom...'
                      : 'Buscar música, artista ou tom...'
                  }
                  className="stage-field-borderless py-1.5"
                />
                {search && (
                  <AuroraIconButton
                    icon="close"
                    label="Limpar busca"
                    onClick={() => setSearch('')}
                    className="icon-pop-in -mr-2"
                  />
                )}
              </div>

              <div className="flex flex-nowrap items-center justify-between sm:justify-start gap-1.5 sm:gap-2">
                <div className="min-w-0 max-w-full">
                  <AuroraSegmented<SortMode>
                    ariaLabel="Ordenação do repertório"
                    value={sortBy}
                    onChange={(next) => {
                      snapshotCards();
                      setSortBy(next);
                    }}
                    options={sortOptions}
                  />
                </div>

                <div className="hidden sm:block">
                  <AuroraSegmented<'cards' | 'list'>
                    ariaLabel="Modo de visualização"
                    value={viewMode}
                    onChange={setViewMode}
                    options={[
                      { value: 'cards', label: 'Cards', icon: 'grid_view' },
                      { value: 'list', label: 'Lista', icon: 'view_list' },
                    ]}
                  />
                </div>
                <AuroraIconButton
                  icon={viewMode === 'cards' ? 'view_list' : 'grid_view'}
                  label="Alternar entre grade de cards e lista compacta"
                  aria-pressed={viewMode === 'list'}
                  variant="outlined"
                  onClick={() => setViewMode(viewMode === 'cards' ? 'list' : 'cards')}
                  className="sm:hidden"
                />
              </div>
            </div>

            {availableKeys.length > 0 && (
              <div
                role="group"
                aria-label="Filtrar por tonalidade"
                className="flex items-center gap-1.5 -mx-4 px-4 scroll-px-4 sm:mx-0 sm:px-0 overflow-x-auto lg:overflow-visible lg:flex-wrap no-scrollbar pb-0.5"
              >
                <AuroraChip
                  selected={keyFilter === ''}
                  onClick={() => {
                    snapshotCards();
                    setKeyFilter('');
                  }}
                >
                  Todos os tons
                </AuroraChip>
                {availableKeys.map((k) => (
                  <AuroraChip
                    key={k}
                    selected={keyFilter === k}
                    onClick={() => {
                      snapshotCards();
                      setKeyFilter((curr) => (curr === k ? '' : k));
                    }}
                  >
                    {k}
                  </AuroraChip>
                ))}
                {hasUnkeyed && (
                  <AuroraChip
                    selected={keyFilter === '__none__'}
                    onClick={() => setKeyFilter((curr) => (curr === '__none__' ? '' : '__none__'))}
                  >
                    Sem tom
                  </AuroraChip>
                )}
                {isFiltered && (
                  <AuroraButton
                    color="text"
                    onClick={() => {
                      setSearch('');
                      setKeyFilter('');
                    }}
                  >
                    Limpar filtros
                  </AuroraButton>
                )}
              </div>
            )}

            {!songsLoaded && songs.length === 0 ? (
              <div
                role="status"
                aria-label="Carregando músicas"
                aria-busy="true"
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4"
              >
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div key={idx} className="h-32 rounded-2xl bg-surface-container-highest" />
                ))}
              </div>
            ) : filteredSongs.length === 0 ? (
              <div className="panel-settle stage-card px-6 py-14 text-center flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary-container text-on-primary-container flex items-center justify-center">
                  <UiIcon name="music_note" size={24} />
                </div>
                <h2 className="typescale-title-lg text-on-surface m-0">
                  {search || keyFilter
                    ? 'Nenhuma música encontrada'
                    : tab === 'favorites'
                      ? 'Nenhuma favorita ainda'
                      : 'Seu repertório está vazio'}
                </h2>
                <p className="typescale-body-md text-on-surface-variant max-w-md m-0">
                  {search || keyFilter
                    ? 'Limpe o filtro de texto ou tonalidade para ver todas as músicas.'
                    : tab === 'favorites'
                      ? 'Toque no coração de qualquer cifra para fixar aqui.'
                      : 'Adicione sua primeira cifra com IA ou importe um arquivo .cho.'}
                </p>
                {search || keyFilter ? (
                  <AuroraButton
                    color="tonal"
                    onClick={() => {
                      snapshotCards();
                      setSearch('');
                      setKeyFilter('');
                    }}
                  >
                    Limpar filtros
                  </AuroraButton>
                ) : (
                  <AuroraButton
                    color="filled"
                    icon="add"
                    onClick={() => navigate('/add-song')}
                  >
                    Nova música
                  </AuroraButton>
                )}
              </div>
            ) : viewMode === 'cards' ? (
              <div key="cards" data-mode="cards" className="view-mode-stage @container">
                <div className="grid grid-cols-1 @[560px]:grid-cols-2 @[880px]:grid-cols-3 @[1220px]:grid-cols-4 gap-4">
                  {filteredSongs.map((song, idx) => (
                    <SongCardItem
                      key={song.id}
                      song={song}
                      index={idx}
                      variant="cards"
                      itemRef={(el) => {
                        if (el) cardRefs.current.set(song.id, el);
                        else cardRefs.current.delete(song.id);
                      }}
                      onOpenActions={setActionSong}
                      onToggleFavorite={(s) =>
                        patchMeta(s.id, 'favorite', s.favorite ? 'false' : 'true')
                      }
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div key="list" data-mode="list" className="view-mode-stage flex flex-col gap-2">
                {filteredSongs.map((song, idx) => (
                  <SongCardItem
                    key={song.id}
                    song={song}
                    index={idx}
                    variant="list"
                    itemRef={(el) => {
                      if (el) cardRefs.current.set(song.id, el);
                      else cardRefs.current.delete(song.id);
                    }}
                    onOpenActions={setActionSong}
                    onToggleFavorite={(s) =>
                      patchMeta(s.id, 'favorite', s.favorite ? 'false' : 'true')
                    }
                  />
                ))}
              </div>
            )}
          </section>
        )}

      {/* Setlists tab */}
      {tab === 'setlists' && (
        <section aria-label="Lista de setlists" className="space-y-4">
          <AuroraCollapsible open={showNewSetlist}>
            <div className="pb-1">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateSetlist();
                }}
                className="stage-card p-5 flex flex-wrap items-center gap-3"
              >
                <label htmlFor="new-setlist-name" className="sr-only">
                  Nome do novo setlist
                </label>
                <input
                  ref={newSetlistInputRef}
                  id="new-setlist-name"
                  type="text"
                  value={newSetlistName}
                  onChange={(e) => setNewSetlistName(e.target.value)}
                  placeholder="Nome do setlist (ex.: Ensaio de sexta, Show bar...)"
                  className="stage-field flex-1 min-w-[220px]"
                />
                <AuroraButton type="submit" color="filled" disabled={!newSetlistName.trim()}>
                  Criar setlist
                </AuroraButton>
                <AuroraButton
                  color="outlined"
                  onClick={() => {
                    setShowNewSetlist(false);
                    setNewSetlistName('');
                  }}
                >
                  Cancelar
                </AuroraButton>
              </form>
            </div>
          </AuroraCollapsible>

          {!setlistsLoaded && setlists.length === 0 ? (
            <div
              role="status"
              aria-label="Carregando setlists"
              aria-busy="true"
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            >
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-44 rounded-2xl bg-surface-container-highest" />
              ))}
            </div>
          ) : setlists.length === 0 ? (
            <div className="stage-card px-6 py-14 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary-container text-on-primary-container flex items-center justify-center">
                <UiIcon name="queue_music" size={24} />
              </div>
              <h2 className="typescale-title-lg text-on-surface m-0">Nenhum setlist criado ainda</h2>
              <p className="typescale-body-md text-on-surface-variant max-w-md m-0">
                Monte a ordem das músicas do ensaio ou apresentação e acompanhe o tempo estimado.
              </p>
              <AuroraButton color="filled" icon="add" onClick={() => setShowNewSetlist(true)}>
                Criar primeiro setlist
              </AuroraButton>
            </div>
          ) : (
            <div className="@container">
              <div className="grid grid-cols-1 @[620px]:grid-cols-2 @[1040px]:grid-cols-3 gap-4">
                {setlists.map((sl, slIdx) => {
                const validSongs = sl.songIds
                  .map((sid) => songs.find((s) => s.id === sid))
                  .filter((s): s is ParsedSong => s !== undefined);
                const firstId = validSongs[0]?.id ?? null;
                const dur = validSongs.length > 0 ? computeSetlistDuration(validSongs) : null;
                const durLabel = dur
                  ? formatSetlistDuration(dur.totalSec, dur.estimatedCount > 0)
                  : null;
                const staggerStyle =
                  slIdx < 8 ? ({ '--stagger-i': slIdx } as CSSProperties) : undefined;

                return (
                  <article
                    key={sl.id}
                    style={staggerStyle}
                    className={`${slIdx < 8 ? 'stagger-item ' : ''}stage-card stage-card-interactive p-5 flex flex-col justify-between gap-4`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <AuroraLink
                          href={`/setlists/${sl.id}`}
                          className="min-w-0 flex-1 no-underline text-on-surface after:absolute after:inset-0"
                        >
                          <h2 className="typescale-title-lg text-on-surface m-0 truncate">
                            {sl.name}
                          </h2>
                          <p className="typescale-body-sm text-on-surface-variant mt-1 mb-0 font-mono tabular-nums">
                            {validSongs.length} {validSongs.length === 1 ? 'música' : 'músicas'}
                            {durLabel ? ` · ${durLabel}` : ''}
                          </p>
                        </AuroraLink>
                        <div className="relative z-10 -mr-2.5 -mt-1.5">
                          <AuroraIconButton
                            icon="delete_outline"
                            label={`Excluir setlist ${sl.name}`}
                            onClick={() => setDeleteSetlistTarget({ id: sl.id, name: sl.name })}
                          />
                        </div>
                      </div>

                      {validSongs.length > 0 && (
                        <ol className="m-0 list-none space-y-1.5 rounded-2xl stage-inset-well px-3.5 py-2.5">
                          {validSongs.slice(0, 3).map((s, idx) => {
                            const info = getDisplayTitleAndArtist(s);
                            const eff = getEffectiveKey(s);
                            return (
                              <li
                                key={s.id}
                                className="flex items-center justify-between gap-2 typescale-body-sm text-on-surface-variant"
                              >
                                <span className="truncate">
                                  <span className="font-mono text-on-surface-variant mr-1.5">{idx + 1}.</span>
                                  <span className="text-on-surface">{info.title}</span>
                                </span>
                                {eff.key && (
                                  <span className="font-mono text-primary flex-shrink-0">
                                    {eff.key}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                          {validSongs.length > 3 && (
                            <li className="typescale-body-sm text-on-surface-variant pt-1">
                              +{validSongs.length - 3} na sequência
                            </li>
                          )}
                        </ol>
                      )}
                    </div>

                    {firstId && (
                      <div className="relative z-10 grid grid-cols-2 gap-2 pt-1">
                        <AuroraLink
                          href={`/slides?setlist=${sl.id}`}
                          className="stage-btn stage-btn-tonal typescale-label-lg no-underline"
                        >
                          <UiIcon name="slideshow" size={20} />
                          <span>Slides</span>
                        </AuroraLink>
                        <AuroraLink
                          href={`/song/${firstId}?setlist=${sl.id}&show=1`}
                          className="stage-btn stage-btn-filled typescale-label-lg no-underline"
                        >
                          <UiIcon name="play_arrow" size={20} />
                          <span>Modo show</span>
                        </AuroraLink>
                      </div>
                    )}
                  </article>
                );
              })}
              </div>
            </div>
          )}
        </section>
      )}
      </div>

      <AuroraSheet
        open={showLibraryMenu}
        onClose={() => setShowLibraryMenu(false)}
        title="Repertório"
        subtitle="Importar ou copiar cifras em ChordPro"
      >
        <div className="flex flex-col gap-2">
          <AuroraButton
            color="outlined"
            icon="upload_file"
            onClick={() => {
              setShowLibraryMenu(false);
              setShowImport(true);
            }}
          >
            Importar arquivo .cho
          </AuroraButton>
          <AuroraButton
            color="outlined"
            icon="content_copy"
            onClick={() => {
              setShowLibraryMenu(false);
              void handleExportAll();
            }}
          >
            Copiar tudo (.cho)
          </AuroraButton>
        </div>
      </AuroraSheet>

      <AuroraSheet
        open={Boolean(currentActionSong)}
        onClose={() => setActionSong(null)}
        title={currentActionSong?.title ?? ''}
        subtitle={currentActionSong?.artist || 'Ações da cifra'}
      >
        {currentActionSong && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="typescale-label-lg text-on-surface">Avaliação</div>
              <div
                role="group"
                aria-label={`Avaliação de ${currentActionSong.title}`}
                className="flex items-center gap-1"
              >
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = star <= currentActionSong.rating;
                  return (
                    <AuroraIconButton
                      key={star}
                      icon="star"
                      filled={active}
                      label={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
                      aria-pressed={active}
                      className={active ? 'text-warn-icon' : ''}
                      onClick={() =>
                        patchMeta(
                          currentActionSong.id,
                          'rating',
                          currentActionSong.rating === star ? 0 : star
                        )
                      }
                    />
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="typescale-label-lg text-on-surface">Adicionar ao setlist</div>
              {setlists.length === 0 ? (
                <AuroraButton
                  color="tonal"
                  icon="add"
                  onClick={() => {
                    setActionSong(null);
                    navigate('/?tab=setlists');
                  }}
                >
                  Criar primeiro setlist
                </AuroraButton>
              ) : (
                <div className="space-y-1.5">
                  {setlists.map((sl) => {
                    const already = sl.songIds.includes(currentActionSong.id);
                    return (
                      <button
                        key={sl.id}
                        type="button"
                        disabled={already}
                        onClick={() => {
                          addSongToSetlist(sl.id, currentActionSong.id);
                          notify(`"${currentActionSong.title}" adicionada em "${sl.name}".`);
                          setActionSong(null);
                        }}
                        className="stage-list-row w-full min-h-[48px] px-4 py-2.5 rounded-2xl bg-surface-container-low hover:bg-surface-container-high border-none flex items-center justify-between gap-2 text-left cursor-pointer disabled:opacity-60 disabled:cursor-default"
                      >
                        <span className="typescale-label-lg text-on-surface truncate">
                          {sl.name}
                        </span>
                        <span className="typescale-body-sm text-on-surface-variant flex-shrink-0">
                          {already
                            ? 'Já incluída'
                            : sl.songIds.length === 1
                              ? '1 música'
                              : `${sl.songIds.length} músicas`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-outline-variant">
              <AuroraButton
                color="tonal"
                icon="slideshow"
                onClick={() => {
                  const id = currentActionSong.id;
                  setActionSong(null);
                  navigate(`/slides?song=${id}`);
                }}
              >
                Abrir em Slides
              </AuroraButton>
              <AuroraButton
                color="danger"
                icon="delete"
                onClick={() => {
                  setDeleteSongTarget(currentActionSong);
                  setActionSong(null);
                }}
              >
                Excluir música
              </AuroraButton>
            </div>
          </div>
        )}
      </AuroraSheet>

      <AuroraDialog
        open={showImport}
        onClose={() => {
          setShowImport(false);
          setImportMsg('');
        }}
        title="Importar arquivos ChordPro (.cho)"
        subtitle="Separe várias músicas com --- numa linha isolada"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="typescale-body-sm text-on-surface-variant">
              Cole abaixo ou carregue um arquivo de texto .cho
            </span>
            <label className="stage-btn stage-btn-tonal typescale-label-lg cursor-pointer focus-within:outline-2 focus-within:outline-primary focus-within:outline-offset-2">
              <UiIcon name="folder_open" size={20} />
              <span>Carregar arquivo</span>
              <input
                type="file"
                accept=".cho,.chordpro,.txt,text/plain"
                onChange={(e) => void handleImportFile(e)}
                className="sr-only"
              />
            </label>
          </div>

          <label htmlFor="import-cho-textarea" className="sr-only">
            Conteúdo ChordPro para importar
          </label>
          <textarea
            id="import-cho-textarea"
            rows={10}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={`{title: Minha música}\n{artist: Artista}\n{key: G}\n\n[Verse 1]\n[G]Letra aqui`}
            className="stage-field font-mono text-xs resize-y"
          />

          {importMsg && (
            <div
              role={importMsg.includes('sucesso') ? 'status' : 'alert'}
              className={`rounded-2xl px-4 py-3 typescale-body-sm ${
                importMsg.includes('sucesso')
                  ? 'bg-tertiary-container text-on-tertiary-container'
                  : 'bg-error-container text-on-error-container'
              }`}
            >
              {importMsg}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <AuroraButton color="outlined" onClick={() => setShowImport(false)}>
              Cancelar
            </AuroraButton>
            <AuroraButton color="filled" onClick={handleImport}>
              Importar
            </AuroraButton>
          </div>
        </div>
      </AuroraDialog>

      <AuroraDialog
        open={Boolean(deleteSongTarget)}
        onClose={() => setDeleteSongTarget(null)}
        title="Excluir música"
        maxWidth="max-w-md"
      >
        {deleteSongTarget && (
          <div className="space-y-4">
            <p className="typescale-body-md text-on-surface-variant m-0">
              Tem certeza que deseja excluir "{deleteSongTarget.title}" do repertório e de todos os setlists?
            </p>
            <div className="flex justify-end gap-2">
              <AuroraButton color="outlined" onClick={() => setDeleteSongTarget(null)}>
                Cancelar
              </AuroraButton>
              <AuroraButton
                color="danger"
                onClick={() => {
                  removeEntry(deleteSongTarget.id);
                  notify(`"${deleteSongTarget.title}" foi excluída.`);
                  setDeleteSongTarget(null);
                }}
              >
                Excluir
              </AuroraButton>
            </div>
          </div>
        )}
      </AuroraDialog>

      <AuroraDialog
        open={Boolean(deleteSetlistTarget)}
        onClose={() => setDeleteSetlistTarget(null)}
        title="Excluir setlist"
        maxWidth="max-w-md"
      >
        {deleteSetlistTarget && (
          <div className="space-y-4">
            <p className="typescale-body-md text-on-surface-variant m-0">
              Excluir o setlist "{deleteSetlistTarget.name}"? As cifras do repertório continuam salvas.
            </p>
            <div className="flex justify-end gap-2">
              <AuroraButton color="outlined" onClick={() => setDeleteSetlistTarget(null)}>
                Cancelar
              </AuroraButton>
              <AuroraButton
                color="danger"
                onClick={() => {
                  deleteSetlist(deleteSetlistTarget.id);
                  notify(`Setlist "${deleteSetlistTarget.name}" excluído.`);
                  setDeleteSetlistTarget(null);
                }}
              >
                Excluir
              </AuroraButton>
            </div>
          </div>
        )}
      </AuroraDialog>
    </main>
  );
}
