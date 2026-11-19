'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { usePlayerStore } from '@/lib/stores/player-store';
import {
  useDisplayStore,
  type DisplayMode,
  type ScrollLeadIn,
  type ThemeMode,
} from '@/lib/stores/display-store';
import { QuickSearchModal } from './QuickSearchModal';
import { ShortcutsModal } from '@/components/ui/ShortcutsModal';
import { HelpCircleIcon, JamshelfMark, PlusIcon } from '@/components/ui/Icons';

const DEVICE_NAME_EVENT = 'jamshelf-device-name-change';

function subscribeDeviceName(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(DEVICE_NAME_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(DEVICE_NAME_EVENT, cb);
  };
}

function getDeviceNameSnapshot(): string {
  try {
    return localStorage.getItem('jamshelf-device-name') || '';
  } catch {
    return '';
  }
}

function getDeviceNameServerSnapshot(): string {
  return '';
}

function subscribeDesktopViewport(cb: () => void) {
  const mql = window.matchMedia('(min-width: 1024px)');
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

function getDesktopViewportSnapshot(): boolean {
  return window.matchMedia('(min-width: 1024px)').matches;
}

function getDesktopViewportServerSnapshot(): boolean {
  return true;
}

function Gm3Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-[var(--ink)]">{label}</div>
        <div className="text-xs text-[var(--muted)]">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`gm3-switch-track relative inline-flex items-center w-[50px] h-[30px] flex-shrink-0 cursor-pointer border ${
          checked
            ? 'bg-[var(--accent)] border-[var(--accent)]'
            : 'bg-[var(--surface2)] border-[var(--line)]'
        }`}
      >
        <span
          className={`gm3-switch-thumb inline-block ${
            checked ? 'bg-[var(--on-accent)]' : 'bg-[var(--muted)]'
          }`}
        />
      </button>
    </div>
  );
}

function DeviceSettingsPopover({
  compact = false,
  align = 'rail',
  onOpenShortcuts,
}: {
  compact?: boolean;
  align?: 'rail' | 'top-right';
  onOpenShortcuts: () => void;
}) {
  const {
    theme,
    setTheme,
    displayMode,
    setDisplayMode,
    fontSize,
    setFontSize,
    visualPulseEnabled,
    setVisualPulseEnabled,
    scrollLeadInSec,
    setScrollLeadInSec,
    singleKeyShortcuts,
    setSingleKeyShortcuts,
  } = useDisplayStore();

  const [open, setOpen] = useState(false);
  const deviceName = useSyncExternalStore(
    subscribeDeviceName,
    getDeviceNameSnapshot,
    getDeviceNameServerSnapshot
  );
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const handleNameChange = (val: string) => {
    try {
      localStorage.setItem('jamshelf-device-name', val);
      window.dispatchEvent(new Event(DEVICE_NAME_EVENT));
    } catch {
      // ignore
    }
  };

  const initial = deviceName.trim().charAt(0).toUpperCase();

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Preferências do aparelho"
        title="Preferências deste aparelho (tema, leitura, fonte e nome no Ao Vivo)"
        className={`gm3-icon-btn hover:bg-[var(--surface-high)] inline-flex items-center gap-2.5 cursor-pointer ${
          compact ? 'w-11 h-11 justify-center' : 'h-11 px-3 w-full'
        }`}
      >
        <span className="w-8 h-8 rounded-full bg-[var(--primary-container)] text-[var(--on-primary-container)] text-xs font-display font-semibold flex items-center justify-center flex-shrink-0">
          {initial || (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="5.2" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M3 13.8c.6-2.6 2.5-4 5-4s4.4 1.4 5 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </span>
        {!compact && (
          <span className="gm3-rail-label truncate text-[13px] font-medium text-[var(--muted)]">
            {deviceName || 'Ajustes'}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Ajustes deste aparelho"
          className={`gm3-card gm3-popover-enter absolute z-50 w-[min(340px,calc(100vw-24px))] max-h-[calc(100vh-110px)] overflow-y-auto rounded-[24px] bg-[var(--surface)] p-5 flex flex-col gap-4 ${
            align === 'rail'
              ? 'left-0 bottom-[calc(100%+10px)]'
              : 'right-0 top-[calc(100%+10px)]'
          }`}
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          <div className="flex items-center justify-between pb-1">
            <span className="font-display text-base font-bold text-[var(--ink)]">Preferências do aparelho</span>
            <span className="studio-chip text-[var(--muted)]">Local</span>
          </div>

          {/* Tema */}
          <div className="flex flex-col gap-2">
            <span className="field-label">Tema</span>
            <div className="gm3-segmented grid grid-cols-3 gap-1 p-1 bg-[var(--bg)]">
              {(
                [
                  { id: 'system', label: 'Sistema' },
                  { id: 'light', label: 'Claro' },
                  { id: 'dark', label: 'Escuro' },
                ] as { id: ThemeMode; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTheme(opt.id)}
                  aria-pressed={theme === opt.id}
                  className={`gm3-segment text-xs font-medium py-1.5 cursor-pointer ${
                    theme === opt.id ? '' : 'text-[var(--muted)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Modo de leitura padrão */}
          <div className="flex flex-col gap-2">
            <span className="field-label">Leitura na música</span>
            <div className="gm3-segmented grid grid-cols-3 gap-1 p-1 bg-[var(--bg)]">
              {(
                [
                  { id: 'both', label: 'Cifra' },
                  { id: 'lyrics-only', label: 'Só letra' },
                  { id: 'chords-only', label: 'Acordes' },
                ] as { id: DisplayMode; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDisplayMode(opt.id)}
                  aria-pressed={displayMode === opt.id}
                  className={`gm3-segment text-xs font-medium py-1.5 cursor-pointer ${
                    displayMode === opt.id ? '' : 'text-[var(--muted)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tamanho da fonte */}
          <div className="flex items-center justify-between gap-2">
            <span className="field-label">Tamanho da letra</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFontSize(fontSize - 10)}
                className="pill-btn bg-[var(--bg)] w-9 h-9 text-xs font-mono"
                aria-label="Diminuir fonte"
              >
                A-
              </button>
              <span className="font-expressive text-sm text-[var(--ink)] w-12 text-center">
                {fontSize}%
              </span>
              <button
                type="button"
                onClick={() => setFontSize(fontSize + 10)}
                className="pill-btn bg-[var(--bg)] w-9 h-9 text-xs font-mono"
                aria-label="Aumentar fonte"
              >
                A+
              </button>
            </div>
          </div>

          {/* Atraso do auto-scroll */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[13px] font-medium text-[var(--ink)]">Atraso do auto-scroll</div>
              <div className="text-xs text-[var(--muted)]">Tempo para segurar o instrumento</div>
            </div>
            <div className="gm3-segmented inline-flex gap-1 p-1 bg-[var(--bg)]">
              {([0, 3, 5] as ScrollLeadIn[]).map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setScrollLeadInSec(sec)}
                  aria-pressed={scrollLeadInSec === sec}
                  className={`gm3-segment font-mono text-xs px-2.5 py-1 cursor-pointer ${
                    scrollLeadInSec === sec ? 'font-semibold' : 'text-[var(--muted)]'
                  }`}
                >
                  {sec === 0 ? '0s' : `${sec}s`}
                </button>
              ))}
            </div>
          </div>

          {/* Pulso visual (GM3 Switch) */}
          <Gm3Switch
            checked={visualPulseEnabled}
            onChange={setVisualPulseEnabled}
            label="Pulso visual do metrônomo"
            description="Faixa discreta no topo (seguro <= 2.5 Hz)"
          />

          {/* Atalhos de tecla única (WCAG 2.1.4 opt-out) */}
          <Gm3Switch
            checked={singleKeyShortcuts}
            onChange={setSingleKeyShortcuts}
            label="Atalhos de tecla única"
            description="Usar /, C, L, S e Espaço no teclado"
          />

          {/* Nome do aparelho */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="jamshelf-device-name" className="field-label">
              Seu nome no Ao Vivo
            </label>
            <input
              id="jamshelf-device-name"
              type="text"
              value={deviceName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ex.: Alex - Violão"
              className="studio-input px-3.5 py-2 text-sm w-full"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenShortcuts();
            }}
            className="pill-btn bg-[var(--bg)] h-10 px-4 text-xs justify-between w-full"
          >
            <span className="inline-flex items-center gap-2">
              <HelpCircleIcon size={16} />
              Atalhos e gestos de palco
            </span>
            <kbd className="font-mono text-xs text-[var(--muted)]">?</kbd>
          </button>

          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Salvo apenas neste aparelho. Não altera a visão dos outros músicos.
          </p>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const entries = useSongStore((s) => s.entries);
  const getSongs = useSongStore((s) => s.getSongs);
  const setlists = useSetlistStore((s) => s.setlists);
  const fetchEntries = useSongStore((s) => s.fetchEntries);
  const fetchSetlists = useSetlistStore((s) => s.fetchSetlists);
  const retrySongSync = useSongStore((s) => s.retryPendingSync);
  const retrySetlistSync = useSetlistStore((s) => s.retryPendingSync);
  const songPendingCount = useSongStore((s) => s.pendingOps.length);
  const setlistPendingCount = useSetlistStore((s) => s.pendingOps.length);
  const songSyncError = useSongStore((s) => s.syncError);
  const setlistSyncError = useSetlistStore((s) => s.syncError);
  const clearSongError = useSongStore((s) => s.clearSyncError);
  const clearSetlistError = useSetlistStore((s) => s.clearSyncError);
  const { theme, focusMode, setFocusMode, singleKeyShortcuts } = useDisplayStore();

  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [retryingSync, setRetryingSync] = useState(false);
  const isDesktopViewport = useSyncExternalStore(
    subscribeDesktopViewport,
    getDesktopViewportSnapshot,
    getDesktopViewportServerSnapshot
  );
  const [railOverride, setRailOverride] = useState<boolean | null>(null);
  const railExpanded = railOverride ?? isDesktopViewport;

  const songs = useMemo(() => {
    void entries;
    return getSongs();
  }, [entries, getSongs]);

  const validSongIds = useMemo(() => new Set(songs.map((s) => s.id)), [songs]);
  const favoriteCount = useMemo(() => songs.filter((s) => s.favorite).length, [songs]);

  useEffect(() => {
    void useSongStore.persist.rehydrate();
    void useSetlistStore.persist.rehydrate();
    void useDisplayStore.persist.rehydrate();
    fetchEntries();
    fetchSetlists();
  }, [fetchEntries, fetchSetlists]);

  useEffect(() => {
    if (!useDisplayStore.persist.hasHydrated()) return;
    const root = document.documentElement;
    if (theme === 'dark' || theme === 'light') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
  }, [theme]);

  useEffect(() => {
    if (!pathname.startsWith('/song/') && focusMode) {
      setFocusMode(false);
    }
  }, [pathname, focusMode, setFocusMode]);

  // Global Cmd/Ctrl+K, '/' quick search, and '?' shortcuts guide
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (usePlayerStore.getState().editMode) return;
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (!singleKeyShortcuts) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === '/') {
        if (usePlayerStore.getState().editMode) return;
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [singleKeyShortcuts]);

  const isSongPage = pathname.startsWith('/song/');
  const isShowMode = isSongPage && searchParams.get('show') === '1';
  const hideChrome = isShowMode || (isSongPage && focusMode);
  const isHomeAll = pathname === '/' && (!searchParams.get('tab') || searchParams.get('tab') === 'all');

  const tabParam = searchParams.get('tab');
  const activeSetlistId = pathname.startsWith('/setlists/')
    ? pathname.split('/')[2] || null
    : searchParams.get('setlist');

  const activeNav =
    pathname === '/'
      ? tabParam === 'favorites'
        ? 'favorites'
        : tabParam === 'setlists'
        ? 'setlists'
        : 'songs'
      : pathname.startsWith('/setlists')
      ? 'setlists'
      : pathname.startsWith('/add-song')
      ? 'add'
      : 'songs';

  const syncError = songSyncError || setlistSyncError;
  const hasPendingWrites = songPendingCount > 0 || setlistPendingCount > 0;

  const handleRetrySync = async () => {
    setRetryingSync(true);
    try {
      if (hasPendingWrites) {
        if (songPendingCount > 0) await retrySongSync();
        if (setlistPendingCount > 0) await retrySetlistSync();
      } else {
        clearSongError();
        clearSetlistError();
        await Promise.all([fetchEntries(), fetchSetlists()]);
      }
    } finally {
      setRetryingSync(false);
    }
  };

  const handleReloadFromServer = async () => {
    clearSongError();
    clearSetlistError();
    await Promise.all([fetchEntries(), fetchSetlists()]);
  };

  const handleDismissSync = () => {
    clearSongError();
    clearSetlistError();
  };

  const navItems = [
    {
      key: 'songs',
      label: 'Repertório',
      shortLabel: 'Repertório',
      href: '/',
      count: songs.length,
      active: activeNav === 'songs',
      softActive: false,
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          {active ? (
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z" fill="currentColor" />
          ) : (
            <path
              d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      ),
    },
    {
      key: 'favorites',
      label: 'Favoritas',
      shortLabel: 'Favoritas',
      href: '/?tab=favorites',
      count: favoriteCount,
      active: activeNav === 'favorites',
      softActive: false,
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 20.4s-7.2-4.4-7.2-9.6A4.1 4.1 0 0 1 12 7.9a4.1 4.1 0 0 1 7.2 2.9c0 5.2-7.2 9.6-7.2 9.6Z"
            fill={active ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      key: 'setlists',
      label: 'Setlists',
      shortLabel: 'Setlists',
      href: '/?tab=setlists',
      count: setlists.length,
      // Avoid dual active pills when a specific pinned setlist is highlighted below
      active: activeNav === 'setlists' && !(railExpanded && !isSongPage && activeSetlistId),
      softActive: activeNav === 'setlists' && Boolean(railExpanded && !isSongPage && activeSetlistId),
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 7h11M4 12h11M4 17h7"
            stroke="currentColor"
            strokeWidth={active ? '2.1' : '1.8'}
            strokeLinecap="round"
          />
          <path
            d="M18 6v9.5a2.3 2.3 0 1 1-1.6-2.2V8.2l3.6-1V5.4L18 6Z"
            fill={active ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
  ];

  // On song pages keep rail collapsed by default so the chord sheet gets maximum horizontal space
  const isExpandedRail = railExpanded && !isSongPage;

  return (
    <div
      className={`min-h-screen flex bg-[var(--bg)] text-[var(--ink)] ${
        isSongPage ? 'h-screen overflow-hidden' : ''
      }`}
    >
      {/* WCAG 2.4.1 Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] pill-btn pill-btn-primary h-10 px-4 text-sm"
      >
        Pular para o conteúdo principal
      </a>

      {/* Desktop & Tablet GM3 Navigation Rail */}
      {!hideChrome && (
        <aside
          aria-label="Navegação principal"
          className={`hidden md:flex flex-col justify-between flex-shrink-0 sticky top-0 h-screen z-40 bg-[var(--bg)] py-5 transition-[width] duration-[280ms] ease-[cubic-bezier(0.05,0.7,0.1,1)] select-none ${
            isExpandedRail ? 'w-[216px] px-4' : 'w-[88px] px-2 items-center'
          }`}
        >
          {/* Top section: Menu toggle + Extended/Standard GM3 FAB */}
          <div className={`flex flex-col gap-5 ${isExpandedRail ? 'items-start w-full' : 'items-center'}`}>
            <div className={`flex items-center gap-2 ${isExpandedRail ? 'w-full justify-between pl-1' : ''}`}>
              <button
                type="button"
                onClick={() => setRailOverride(!railExpanded)}
                aria-label={isExpandedRail ? 'Recolher barra lateral' : 'Expandir barra lateral'}
                title={isExpandedRail ? 'Recolher menu' : 'Expandir menu'}
                className="gm3-icon-btn w-11 h-11 flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 7h16M4 12h16M4 17h16"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              {isExpandedRail && (
                <Link
                  href="/"
                  className="gm3-rail-label inline-flex items-center gap-2 font-expressive text-[19px] text-[var(--ink)] tracking-[-0.02em] pr-1 hover:text-[var(--accent)] transition-colors whitespace-nowrap"
                >
                  <JamshelfMark size={24} />
                  <span>Jamshelf</span>
                </Link>
              )}
            </div>

            <Link
              href="/add-song"
              aria-label="Nova música"
              aria-current={activeNav === 'add' ? 'page' : undefined}
              title="Adicionar nova música"
              className={`gm3-fab h-14 ${
                isExpandedRail ? 'px-5 w-full justify-start text-[14px]' : 'w-14'
              }`}
            >
              <PlusIcon size={20} className="flex-shrink-0" />
              {isExpandedRail && <span className="gm3-rail-label whitespace-nowrap">Nova música</span>}
            </Link>
          </div>

          {/* Center section: Primary navigation items + Pinned setlists */}
          <div className="flex-1 flex flex-col justify-start gap-6 overflow-y-auto no-scrollbar py-6 w-full">
            <nav aria-label="Menu principal" className={`flex flex-col ${isExpandedRail ? 'gap-1.5' : 'gap-4 items-center'}`}>
              {navItems.map((item) =>
                isExpandedRail ? (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={item.active ? 'page' : undefined}
                    data-active={item.active || undefined}
                    className={`gm3-nav-pill gm3-nav-pill-expanded h-11 px-4 flex items-center justify-between gap-2 text-[14px] font-medium ${
                      item.active
                        ? 'text-[var(--on-secondary-container)]'
                        : item.softActive
                        ? 'text-[var(--ink)] font-semibold'
                        : 'text-[var(--muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="flex-shrink-0">{item.icon(item.active || item.softActive)}</span>
                      <span className="gm3-rail-label truncate whitespace-nowrap">{item.label}</span>
                    </span>
                    <span className="gm3-rail-label font-mono text-xs tabular-nums">{item.count}</span>
                  </Link>
                ) : (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={item.active ? 'page' : undefined}
                    className="group flex flex-col items-center gap-1 w-full"
                  >
                    <span
                      data-active={item.active || undefined}
                      className={`gm3-nav-pill w-14 h-8 flex items-center justify-center ${
                        item.active
                          ? 'text-[var(--on-secondary-container)]'
                          : 'text-[var(--muted)] group-hover:text-[var(--ink)]'
                      }`}
                    >
                      {item.icon(item.active)}
                    </span>
                    <span
                      className={`text-xs font-medium transition-colors ${
                        item.active ? 'text-[var(--ink)]' : 'text-[var(--muted)]'
                      }`}
                    >
                      {item.shortLabel}
                    </span>
                  </Link>
                )
              )}
            </nav>

            {/* Quick setlists list when rail is expanded */}
            {isExpandedRail && setlists.length > 0 && (
              <div className="gm3-rail-label space-y-1.5 pt-2">
                <div className="px-4 text-xs font-medium text-[var(--muted)]">Setlists</div>
                <nav aria-label="Setlists fixados" className="flex flex-col gap-0.5 max-h-48 overflow-y-auto no-scrollbar">
                  {setlists.slice(0, 6).map((sl) => {
                    const isActive = activeSetlistId === sl.id;
                    const validCount = sl.songIds.filter((sid) => validSongIds.has(sid)).length;
                    return (
                      <Link
                        key={sl.id}
                        href={`/setlists/${sl.id}`}
                        aria-current={isActive ? 'page' : undefined}
                        data-active={isActive || undefined}
                        className={`gm3-nav-pill gm3-nav-pill-expanded h-9 px-4 flex items-center justify-between gap-2 text-[13px] ${
                          isActive
                            ? 'text-[var(--on-secondary-container)] font-medium'
                            : 'text-[var(--muted)] hover:text-[var(--ink)]'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              isActive
                                ? 'bg-[var(--on-secondary-container)]'
                                : validCount === 0
                                ? 'bg-[var(--line)]'
                                : 'bg-[var(--muted)]'
                            }`}
                          />
                          <span className="truncate">{sl.name}</span>
                        </span>
                        <span className="font-mono text-xs tabular-nums">{validCount}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            )}
          </div>

          {/* Bottom section: Quick Search + Device Settings */}
          <div className={`flex flex-col gap-1.5 w-full ${isExpandedRail ? '' : 'items-center'}`}>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Busca rápida"
              title="Busca rápida (/ ou Ctrl+K)"
              className={`gm3-icon-btn hover:bg-[var(--surface-high)] text-[var(--muted)] hover:text-[var(--ink)] inline-flex items-center gap-2.5 cursor-pointer ${
                isExpandedRail ? 'h-11 px-4 justify-between w-full' : 'w-11 h-11 justify-center'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
                  <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
                {isExpandedRail && <span className="gm3-rail-label text-[13px] font-medium whitespace-nowrap">Buscar</span>}
              </span>
              {isExpandedRail && (
                <kbd className="gm3-rail-label font-mono text-xs px-1.5 py-0.5 rounded-md bg-[var(--surface)] text-[var(--muted)]">
                  /
                </kbd>
              )}
            </button>

            <DeviceSettingsPopover
              compact={!isExpandedRail}
              align="rail"
              onOpenShortcuts={() => setShortcutsOpen(true)}
            />
          </div>
        </aside>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Compact mobile-only utility row */}
        {!hideChrome && !isSongPage && (
          <header className="md:hidden flex items-center justify-between gap-2 px-4 pt-3 pb-1">
            <Link href="/" className="inline-flex items-center gap-2 font-expressive text-xl text-[var(--ink)]">
              <JamshelfMark size={24} />
              <span>Jamshelf</span>
            </Link>
            <div className="flex items-center gap-1">
              {!isHomeAll && (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Busca rápida"
                  className="gm3-icon-btn w-10 h-10 flex items-center justify-center text-[var(--muted)] hover:bg-[var(--surface-high)] cursor-pointer"
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
                    <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  </svg>
                </button>
              )}
              <DeviceSettingsPopover
                compact
                align="top-right"
                onOpenShortcuts={() => setShortcutsOpen(true)}
              />
            </div>
          </header>
        )}

        {/* Sync error banner (retries pending local edits safely instead of overwriting them) */}
        {syncError && (
          <div role="alert" className="flex-shrink-0 px-4 sm:px-6 lg:px-8 pt-2.5">
            <div className="w-full rounded-2xl bg-[var(--rec-dim)] text-[var(--on-rec-container)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--rec-dot)] flex-shrink-0" />
                <span>{syncError}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={retryingSync}
                  onClick={handleRetrySync}
                  className="pill-btn h-8 px-3.5 text-xs"
                >
                  {retryingSync
                    ? 'Enviando…'
                    : hasPendingWrites
                    ? 'Tentar enviar novamente'
                    : 'Recarregar'}
                </button>
                {hasPendingWrites && (
                  <button
                    type="button"
                    onClick={handleReloadFromServer}
                    className="px-2 py-1 text-xs underline underline-offset-2 cursor-pointer"
                  >
                    Descartar local
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDismissSync}
                  className="px-2 py-1 text-xs hover:underline cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        <div
          className={`flex-1 flex flex-col min-w-0 min-h-0 ${
            !isSongPage && !hideChrome ? 'pb-36 md:pb-0' : ''
          }`}
        >
          {children}
        </div>
      </div>

      {/* Mobile floating GM3 FAB + Bottom Navigation Bar */}
      {!hideChrome && !isSongPage && (
        <>
          {!pathname.startsWith('/add-song') && !pathname.startsWith('/setlists/') && tabParam !== 'setlists' && (
            <Link
              href="/add-song"
              aria-label="Nova música"
              className="md:hidden gm3-fab fixed right-4 bottom-20 z-30 h-14 px-5 text-sm shadow-md"
            >
              <PlusIcon size={20} />
              <span>Nova música</span>
            </Link>
          )}

          <nav
            aria-label="Navegação móvel"
            className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--surface-high)]/95 backdrop-blur-md"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="grid grid-cols-3 h-16 px-2">
              {navItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  className="group flex flex-col items-center justify-center gap-1"
                >
                  <span
                    data-active={item.active || undefined}
                    className={`gm3-nav-pill w-16 h-8 flex items-center justify-center ${
                      item.active
                        ? 'text-[var(--on-secondary-container)]'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    {item.icon(item.active)}
                  </span>
                  <span
                    className={`text-xs font-medium transition-colors ${
                      item.active ? 'text-[var(--ink)]' : 'text-[var(--muted)]'
                    }`}
                  >
                    {item.shortLabel}
                  </span>
                </Link>
              ))}
            </div>
          </nav>
        </>
      )}

      <QuickSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
