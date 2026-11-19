'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import {
  useDisplayStore,
  type DisplayMode,
  type ScrollLeadIn,
  type ThemeMode,
} from '@/lib/stores/display-store';
import { QuickSearchModal } from './QuickSearchModal';

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

function BrandMark() {
  return (
    <svg viewBox="0 0 28 28" className="w-6 h-6 flex-shrink-0" aria-hidden="true">
      <rect x="2" y="13" width="4.5" height="11" rx="2.25" fill="#4285F4" />
      <rect x="8.8" y="6" width="4.5" height="18" rx="2.25" fill="#EA4335" />
      <rect x="15.6" y="10" width="4.5" height="14" rx="2.25" fill="#FBBC04" />
      <rect x="22.4" y="4" width="4.5" height="20" rx="2.25" fill="#34A853" />
    </svg>
  );
}

function ContextSetlistPicker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setlists = useSetlistStore((s) => s.setlists);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const activeSetlistId = pathname.startsWith('/setlists/')
    ? pathname.split('/')[2] || null
    : searchParams.get('setlist');

  const activeSetlist = activeSetlistId
    ? setlists.find((sl) => sl.id === activeSetlistId) ?? null
    : null;

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

  return (
    <div ref={wrapRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Alternar contexto entre repertório geral e setlists"
        className="h-8 px-2.5 rounded-[4px] border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface2)] text-[13px] font-medium text-[var(--ink)] inline-flex items-center gap-2 transition-colors cursor-pointer max-w-[200px]"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="text-[var(--muted)] flex-shrink-0">
          <path
            d="M2.5 4h7.5M2.5 8h7.5M2.5 12h5.5M12.5 3.5v6.8a1.7 1.7 0 1 1-1.2-1.6V4.6l2.7-.7V2.7l-1.5.8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="truncate font-display">
          {activeSetlist ? activeSetlist.name : 'Repertório'}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className={`text-[var(--muted)] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Selecionar contexto"
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-64 rounded-lg border border-[var(--line)] bg-[var(--surface)] py-1.5"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          <div className="px-3 py-1.5 eyebrow">Contexto de trabalho</div>
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className={`flex items-center justify-between px-3 py-2 text-[13px] transition-colors ${
              !activeSetlist
                ? 'bg-[var(--nav-active-bg)] text-[var(--accent-ink)] font-medium'
                : 'text-[var(--ink)] hover:bg-[var(--surface2)]'
            }`}
          >
            <span>Repertório completo</span>
            {!activeSetlist && <span className="text-xs">✓</span>}
          </Link>

          <div className="my-1.5 border-t border-[var(--line-subtle)]" />
          <div className="px-3 py-1 eyebrow">Setlists</div>

          {setlists.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--muted)]">Nenhum setlist criado.</div>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              {setlists.map((sl) => {
                const selected = activeSetlist?.id === sl.id;
                return (
                  <Link
                    key={sl.id}
                    href={`/setlists/${sl.id}`}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 text-[13px] transition-colors ${
                      selected
                        ? 'bg-[var(--nav-active-bg)] text-[var(--accent-ink)] font-medium'
                        : 'text-[var(--ink)] hover:bg-[var(--surface2)]'
                    }`}
                  >
                    <span className="truncate">{sl.name}</span>
                    <span className="font-mono text-[11px] text-[var(--muted)] flex-shrink-0">
                      {sl.songIds.length}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="my-1.5 border-t border-[var(--line-subtle)]" />
          <Link
            href="/?tab=setlists"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-[var(--nav-active-bg)]"
          >
            Gerenciar todos os setlists
          </Link>
        </div>
      )}
    </div>
  );
}

function DeviceSettingsPopover() {
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
        title="Preferências deste aparelho (tema, leitura, fonte e nome no Ao Vivo)"
        className="h-8 px-2 rounded-full hover:bg-[var(--surface2)] inline-flex items-center gap-2 transition-colors cursor-pointer"
      >
        <span className="w-7 h-7 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-xs font-display font-semibold flex items-center justify-center flex-shrink-0">
          {initial || (
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="5.2" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 13.8c.6-2.6 2.5-4 5-4s4.4 1.4 5 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </span>
        <span className="max-w-[11ch] truncate hidden xl:inline text-[13px] font-medium text-[var(--ink)]">
          {deviceName || 'Ajustes'}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Ajustes deste aparelho"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(328px,calc(100vw-24px))] rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 flex flex-col gap-4"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          <div className="flex items-center justify-between border-b border-[var(--line-subtle)] pb-2.5">
            <span className="font-display text-sm text-[var(--ink)]">Preferências do aparelho</span>
            <span className="studio-chip text-[var(--muted)]">Local</span>
          </div>

          {/* Aparência */}
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow">Tema</span>
            <div className="inline-flex rounded-[4px] border border-[var(--line)] overflow-hidden self-start">
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
                  className={`font-display text-xs px-3 py-1.5 transition-colors cursor-pointer ${
                    theme === opt.id
                      ? 'bg-[var(--nav-active-bg)] text-[var(--accent-ink)] font-medium'
                      : 'text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--ink)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Modo de leitura padrão */}
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow">Leitura na música</span>
            <div className="inline-flex rounded-[4px] border border-[var(--line)] overflow-hidden self-start">
              {(
                [
                  { id: 'both', label: 'Cifra + Letra' },
                  { id: 'lyrics-only', label: 'Só letra' },
                  { id: 'chords-only', label: 'Só acordes' },
                ] as { id: DisplayMode; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDisplayMode(opt.id)}
                  aria-pressed={displayMode === opt.id}
                  className={`font-display text-xs px-2.5 py-1.5 transition-colors cursor-pointer ${
                    displayMode === opt.id
                      ? 'bg-[var(--nav-active-bg)] text-[var(--accent-ink)] font-medium'
                      : 'text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--ink)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tamanho da fonte */}
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">Tamanho da letra</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFontSize(fontSize - 10)}
                className="pill-btn w-7 h-7 text-xs font-mono"
                aria-label="Diminuir fonte"
              >
                A-
              </button>
              <span className="font-mono text-xs text-[var(--ink)] w-11 text-center tabular-nums">
                {fontSize}%
              </span>
              <button
                type="button"
                onClick={() => setFontSize(fontSize + 10)}
                className="pill-btn w-7 h-7 text-xs font-mono"
                aria-label="Aumentar fonte"
              >
                A+
              </button>
            </div>
          </div>

          {/* Contagem do auto-scroll */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="eyebrow">Atraso do auto-scroll</div>
              <div className="text-[11px] text-[var(--muted)]">Tempo para segurar o instrumento</div>
            </div>
            <div className="inline-flex rounded-[4px] border border-[var(--line)] overflow-hidden">
              {([0, 3, 5] as ScrollLeadIn[]).map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setScrollLeadInSec(sec)}
                  aria-pressed={scrollLeadInSec === sec}
                  className={`font-mono text-[11px] px-2.5 py-1 transition-colors cursor-pointer ${
                    scrollLeadInSec === sec
                      ? 'bg-[var(--nav-active-bg)] text-[var(--accent-ink)] font-semibold'
                      : 'text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--ink)]'
                  }`}
                >
                  {sec === 0 ? '0s' : `${sec}s`}
                </button>
              ))}
            </div>
          </div>

          {/* Pulso visual */}
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <div>
              <div className="text-[13px] font-medium text-[var(--ink)]">Pulso visual do metrônomo</div>
              <div className="text-[11px] text-[var(--muted)]">Pisca a borda da tela no tempo</div>
            </div>
            <input
              type="checkbox"
              checked={visualPulseEnabled}
              onChange={(e) => setVisualPulseEnabled(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
            />
          </label>

          {/* Nome do aparelho para sessão ao vivo */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="jamshelf-device-name" className="eyebrow">
              Seu nome no Ao Vivo
            </label>
            <input
              id="jamshelf-device-name"
              type="text"
              value={deviceName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ex.: Alex - Violão"
              className="studio-input px-3 py-1.5 text-sm w-full"
            />
          </div>

          <p className="text-[11px] text-[var(--muted)] leading-relaxed border-t border-[var(--line-subtle)] pt-2.5">
            Salvo apenas neste aparelho. Não altera a visão dos outros músicos da banda.
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
  const songSyncError = useSongStore((s) => s.syncError);
  const setlistSyncError = useSetlistStore((s) => s.syncError);
  const clearSongError = useSongStore((s) => s.clearSyncError);
  const clearSetlistError = useSetlistStore((s) => s.clearSyncError);
  const { theme, setTheme, focusMode, setFocusMode } = useDisplayStore();

  const [searchOpen, setSearchOpen] = useState(false);
  const [desktopRailOpen, setDesktopRailOpen] = useState(true);
  const [overlayDrawerOpen, setOverlayDrawerOpen] = useState(false);

  const songs = useMemo(() => {
    void entries;
    return getSongs();
  }, [entries, getSongs]);

  const favoriteCount = useMemo(() => songs.filter((s) => s.favorite).length, [songs]);

  // Initial library sync
  useEffect(() => {
    fetchEntries();
    fetchSetlists();
  }, [fetchEntries, fetchSetlists]);

  // Apply theme attribute to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark' || theme === 'light') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
  }, [theme]);

  // Automatically leave focus mode when navigating away from a song page
  useEffect(() => {
    if (!pathname.startsWith('/song/') && focusMode) {
      setFocusMode(false);
    }
  }, [pathname, focusMode, setFocusMode]);

  // Global Cmd/Ctrl+K and '/' quick search shortcut (Cloud Console pattern)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const isSongPage = pathname.startsWith('/song/');
  const isShowMode = isSongPage && searchParams.get('show') === '1';
  const hideChrome = isShowMode || (isSongPage && focusMode);

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

  const handleRetrySync = () => {
    clearSongError();
    clearSetlistError();
    fetchEntries();
    fetchSetlists();
  };

  const handleDismissSync = () => {
    clearSongError();
    clearSetlistError();
  };

  const handleMenuToggle = () => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024 && !isSongPage) {
      setDesktopRailOpen((v) => !v);
    } else {
      setOverlayDrawerOpen((v) => !v);
    }
  };

  const renderNavLinks = (closeOnNavigate: boolean) => {
    const closeIfOverlay = () => {
      if (closeOnNavigate) setOverlayDrawerOpen(false);
    };

    const primaryItems = [
      {
        key: 'songs',
        label: 'Todas as músicas',
        href: '/',
        count: songs.length,
        active: pathname === '/' && activeNav === 'songs',
        icon: (
          <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 5.5h12M4 10h12M4 14.5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        key: 'favorites',
        label: 'Favoritas',
        href: '/?tab=favorites',
        count: favoriteCount,
        active: pathname === '/' && activeNav === 'favorites',
        icon: (
          <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M10 16.2s-5.7-3.5-5.7-7.7A3.2 3.2 0 0 1 10 6.2a3.2 3.2 0 0 1 5.7 2.3c0 4.2-5.7 7.7-5.7 7.7Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        ),
      },
      {
        key: 'setlists',
        label: 'Setlists',
        href: '/?tab=setlists',
        count: setlists.length,
        active: pathname === '/' && activeNav === 'setlists',
        icon: (
          <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M3.5 5.5h8.5M3.5 10h8.5M3.5 14.5h6M15 5v8.2a2 2 0 1 1-1.5-1.9V6.8l3-.8V4.2L15 5Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.45"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ),
      },
      {
        key: 'add',
        label: 'Nova música',
        href: '/add-song',
        count: null as number | null,
        active: pathname.startsWith('/add-song'),
        icon: (
          <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        ),
      },
    ];

    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto py-3">
          <div className="px-4 pb-1.5 eyebrow">Repertório</div>
          <nav aria-label="Menu principal" className="space-y-0.5 pr-3">
            {primaryItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                onClick={closeIfOverlay}
                aria-current={item.active ? 'page' : undefined}
                className={`flex items-center justify-between gap-2 pl-4 pr-3 py-2 rounded-r-full text-[13.5px] font-display transition-colors ${
                  item.active
                    ? 'bg-[var(--nav-active-bg)] text-[var(--accent-ink)] font-medium'
                    : 'text-[var(--ink)] hover:bg-[var(--surface2)]'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className={item.active ? 'text-[var(--accent-ink)]' : 'text-[var(--muted)]'}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </span>
                {item.count !== null && (
                  <span className="font-mono text-[11px] text-[var(--muted)] tabular-nums">
                    {item.count}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <div className="my-3 border-t border-[var(--line-subtle)]" />

          <div className="px-4 pb-1.5 flex items-center justify-between">
            <span className="eyebrow">Setlists fixados</span>
            <Link
              href="/?tab=setlists"
              onClick={closeIfOverlay}
              className="text-[11px] font-display text-[var(--accent-ink)] hover:underline"
            >
              Ver todos
            </Link>
          </div>

          {setlists.length === 0 ? (
            <div className="px-4 py-2 text-xs text-[var(--muted)]">
              Nenhum setlist criado ainda.
            </div>
          ) : (
            <nav aria-label="Setlists" className="space-y-0.5 pr-3">
              {setlists.map((sl) => {
                const isActive = activeSetlistId === sl.id;
                return (
                  <Link
                    key={sl.id}
                    href={`/setlists/${sl.id}`}
                    onClick={closeIfOverlay}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center justify-between gap-2 pl-4 pr-3 py-1.5 rounded-r-full text-[13px] font-display transition-colors ${
                      isActive
                        ? 'bg-[var(--nav-active-bg)] text-[var(--accent-ink)] font-medium'
                        : 'text-[var(--ink)] hover:bg-[var(--surface2)]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          isActive ? 'bg-[var(--accent)]' : 'bg-[var(--muted)]/55'
                        }`}
                      />
                      <span className="truncate">{sl.name}</span>
                    </span>
                    <span className="font-mono text-[11px] text-[var(--muted)] tabular-nums">
                      {sl.songIds.length}
                    </span>
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {/* Sidebar footer: quick theme switch */}
        <div className="border-t border-[var(--line-subtle)] px-4 py-2.5 flex items-center justify-between gap-2 text-[11.5px] text-[var(--muted)]">
          <span className="font-display">Tema</span>
          <div className="inline-flex rounded-[4px] border border-[var(--line)] overflow-hidden">
            {(
              [
                { id: 'light', label: 'Claro' },
                { id: 'dark', label: 'Escuro' },
                { id: 'system', label: 'Auto' },
              ] as { id: ThemeMode; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                className={`px-2 py-0.5 font-display text-[11px] cursor-pointer transition-colors ${
                  theme === opt.id
                    ? 'bg-[var(--nav-active-bg)] text-[var(--accent-ink)] font-medium'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)] ${
        isSongPage ? 'h-screen overflow-hidden' : ''
      }`}
    >
      {/* Google Cloud Console top app bar */}
      {!hideChrome && (
        <header className="sticky top-0 flex-shrink-0 h-12 border-b border-[var(--line)] bg-[var(--surface)] z-30">
          <div className="h-full px-2 sm:px-3 flex items-center justify-between gap-2 sm:gap-3">
            {/* Left: Menu toggle + Brand + Setlist Context Picker */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
              <button
                type="button"
                onClick={handleMenuToggle}
                aria-label="Abrir ou recolher menu de navegação"
                className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] transition-colors cursor-pointer"
                title="Menu de navegação"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    d="M3 5.5h14M3 10h14M3 14.5h14"
                    stroke="currentColor"
                    strokeWidth="1.65"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              <Link
                href="/"
                className="flex items-center gap-2 text-[var(--ink)] hover:opacity-90 transition-opacity pr-1"
              >
                <BrandMark />
                <span className="font-display text-[18px] tracking-[-0.015em] leading-none">
                  Jamshelf
                </span>
              </Link>

              <ContextSetlistPicker />
            </div>

            {/* Center: Cloud Console omni-search trigger */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex-1 max-w-xl h-9 px-3 rounded-lg bg-[var(--surface2)] hover:bg-[var(--surface2)]/80 border border-transparent hover:border-[var(--line)] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer min-w-0"
              title="Pesquisar músicas, artistas, tons e setlists (/ ou Ctrl+K)"
            >
              <span className="flex items-center gap-2.5 min-w-0 text-[13.5px] text-[var(--muted)]">
                <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" className="flex-shrink-0">
                  <circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <path d="m10.8 10.8 3.2 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span className="truncate hidden sm:inline">
                  Pesquisar músicas, artistas, tons e setlists
                </span>
                <span className="truncate sm:hidden">Pesquisar</span>
              </span>
              <kbd className="hidden md:inline-flex items-center font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--line)] text-[var(--muted)] flex-shrink-0">
                /
              </kbd>
            </button>

            {/* Right: Primary add CTA + Device settings avatar */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <Link
                href="/add-song"
                className="pill-btn pill-btn-primary h-8 px-3 text-[13px] hidden sm:inline-flex"
              >
                + Nova música
              </Link>
              <DeviceSettingsPopover />
            </div>
          </div>
        </header>
      )}

      {/* Sync error banner */}
      {syncError && !isShowMode && (
        <div
          role="status"
          className="flex-shrink-0 border-b border-[var(--line)] bg-[var(--surface)] px-4 sm:px-6 py-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-[var(--ink)]">
              <span className="w-2 h-2 rounded-full bg-[var(--rec)] flex-shrink-0" />
              <span>{syncError}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleRetrySync} className="pill-btn px-2.5 py-1 text-[11.5px]">
                Recarregar
              </button>
              <button
                type="button"
                onClick={handleDismissSync}
                className="text-[var(--muted)] hover:text-[var(--ink)] px-1.5 py-1 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workspace row: optional persistent desktop sidebar + main routed content */}
      <div className="flex-1 flex min-h-0">
        {!hideChrome && !isSongPage && desktopRailOpen && (
          <aside
            aria-label="Navegação lateral"
            className="hidden lg:block w-[240px] flex-shrink-0 border-r border-[var(--line)] bg-[var(--surface)] sticky top-12 h-[calc(100vh-3rem)]"
          >
            {renderNavLinks(false)}
          </aside>
        )}

        <div
          className={`flex-1 flex flex-col min-w-0 min-h-0 ${
            !isSongPage && !hideChrome ? 'pb-16 md:pb-0' : ''
          }`}
        >
          {children}
        </div>
      </div>

      {/* Overlay navigation drawer (mobile + song pages) */}
      {!hideChrome && overlayDrawerOpen && (
        <>
          <div
            className="fixed inset-0 top-12 bg-black/40 z-40"
            onClick={() => setOverlayDrawerOpen(false)}
          />
          <aside
            aria-label="Menu de navegação"
            className="fixed top-12 bottom-0 left-0 w-[264px] max-w-[82vw] z-50 border-r border-[var(--line)] bg-[var(--surface)]"
            style={{ boxShadow: 'var(--shadow-md)' }}
          >
            {renderNavLinks(true)}
          </aside>
        </>
      )}

      {/* Mobile bottom navigation bar (shown on library/setlists/add pages) */}
      {!hideChrome && !isSongPage && (
        <nav
          aria-label="Navegação móvel"
          className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[var(--line)] bg-[var(--surface)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="grid grid-cols-4 h-14">
            {[
              {
                key: 'songs',
                label: 'Músicas',
                href: '/',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M4 5.5h12M4 10h12M4 14.5h8" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
                  </svg>
                ),
              },
              {
                key: 'favorites',
                label: 'Favoritas',
                href: '/?tab=favorites',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M10 16.5s-6-3.7-6-8.1A3.4 3.4 0 0 1 10 6a3.4 3.4 0 0 1 6 2.4c0 4.4-6 8.1-6 8.1Z"
                      fill={activeNav === 'favorites' ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="1.55"
                      strokeLinejoin="round"
                    />
                  </svg>
                ),
              },
              {
                key: 'setlists',
                label: 'Setlists',
                href: '/?tab=setlists',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M4 5.5h8M4 10h8M4 14.5h6M15 5v8.5a2 2 0 1 1-1.5-1.9V7l3-.8V4.5L15 5Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ),
              },
              {
                key: 'add',
                label: 'Adicionar',
                href: '/add-song',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                    <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.55" />
                    <path d="M10 6.8v6.4M6.8 10h6.4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
                  </svg>
                ),
              },
            ].map((item) => {
              const active = activeNav === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-display font-medium ${
                    active ? 'text-[var(--accent-ink)]' : 'text-[var(--muted)]'
                  }`}
                >
                  <span
                    className={`px-3 py-0.5 rounded-full transition-colors ${
                      active ? 'bg-[var(--nav-active-bg)]' : ''
                    }`}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <QuickSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
