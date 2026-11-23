import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ParsedSong, Section, Setlist } from '@/lib/types/song';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore, type DisplayMode } from '@/lib/stores/display-store';
import type { useLiveSession } from '@/lib/stores/live-session-store';
import { formatDuration, parseDurationValue } from '@/lib/utils/chordpro-parser';
import { formatSectionLabel, isMinorKey } from '@/lib/utils/music';
import { playCountInClick } from '@/lib/utils/pitch-audio';
import { usePrefersReducedMotion } from '../aurora/energy';
import {
  AuroraButton,
  AuroraDialog,
  AuroraIconButton,
  AuroraSegmented,
  UiIcon,
  useModalA11y,
} from '../aurora/primitives';
import { SongAdjustmentsPopover } from './SongAdjustmentsPopover';

export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  album?: string;
  albumArt?: string | null;
  durationMs?: number;
}

export function CountInOverlay({
  bpm,
  beats,
  leaderName,
  onDone,
  onCancel,
}: {
  bpm: number;
  beats: number;
  leaderName?: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const safeBpm = Math.max(40, Math.min(240, bpm || 120));
  const safeBeats = Math.max(2, Math.min(8, beats || 4));
  const [step, setStep] = useState(1);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const reduced = usePrefersReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLSpanElement>(null);
  const numRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  const cancelRef = useRef(onCancel);
  doneRef.current = onDone;
  cancelRef.current = onCancel;

  useModalA11y(true, dialogRef, () => cancelRef.current());

  useEffect(() => {
    const msPerBeat = Math.round(60000 / safeBpm);
    let current = 1;
    if (!mutedRef.current) playCountInClick(true);

    const id = window.setInterval(() => {
      current += 1;
      if (current > safeBeats) {
        window.clearInterval(id);
        doneRef.current();
        return;
      }
      setStep(current);
      if (!mutedRef.current) playCountInClick(false);
    }, msPerBeat);

    return () => window.clearInterval(id);
  }, [safeBpm, safeBeats]);

  // WCAG 2.3.1: disable rapid pulse above 150 BPM (<= 2.5 Hz) or under reduced motion; critically damped (zero overshoot)
  const safeStatic = reduced || safeBpm > 150;

  useEffect(() => {
    const numEl = numRef.current;
    const haloEl = haloRef.current;
    numEl?.getAnimations().forEach((a) => a.cancel());
    haloEl?.getAnimations().forEach((a) => a.cancel());
    if (safeStatic) return;
    const anims: Animation[] = [];
    if (numEl) {
      anims.push(
        numEl.animate(
          [
            { transform: 'scale(0.92)', opacity: 0.7 },
            { transform: 'scale(1)', opacity: 1 },
          ],
          { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
        )
      );
    }
    if (step === 1 && haloEl) {
      anims.push(
        haloEl.animate(
          [
            { transform: 'scale(0.76)', opacity: 0.72 },
            { transform: 'scale(1.48)', opacity: 0 },
          ],
          { duration: 460, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
        )
      );
    }
    return () => anims.forEach((a) => a.cancel());
  }, [step, safeStatic]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-motion-scheme="standard"
      className="fixed inset-0 z-50 stage-scrim flex items-center justify-center p-6"
      onClick={() => cancelRef.current()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Contagem de ${safeBeats} tempos a ${safeBpm} BPM`}
        tabIndex={-1}
        className="stage-dialog focus:outline-none w-full max-w-xs px-8 py-8 text-center space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-0.5">
          <div className="typescale-label-sm text-on-surface-variant">
            {leaderName ? `Contagem ao vivo · ${leaderName}` : 'Contagem de entrada'}
          </div>
          <div className="font-mono typescale-body-sm text-on-surface-variant tabular-nums">
            {safeBpm} BPM · {safeBeats} tempos
          </div>
        </div>

        <div className="relative flex items-center justify-center h-[112px]" aria-live="assertive" aria-atomic="true">
          {step === 1 && !reduced && (
            <span
              ref={haloRef}
              aria-hidden="true"
              className="pointer-events-none absolute w-28 h-28 rounded-full border-2 border-primary"
              style={{ opacity: 0 }}
            />
          )}
          <div
            ref={numRef}
            className={`typescale-hero-count select-none ${
              step === 1 ? 'text-primary' : 'text-on-surface'
            }`}
          >
            {step}
          </div>
        </div>

        {!safeStatic && (
          <div className="flex items-center justify-center gap-3" aria-hidden="true">
            {Array.from({ length: safeBeats }).map((_, idx) => {
              const beatNum = idx + 1;
              const isNow = beatNum === step;
              const passed = beatNum < step;
              return (
                <span
                  key={beatNum}
                  data-active={isNow ? (idx === 0 ? 'downbeat' : 'beat') : undefined}
                  className={`beat-dot ${
                    isNow ? 'bg-primary' : passed ? 'bg-tertiary' : 'bg-outline'
                  }`}
                />
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-center gap-2 pt-1">
          <AuroraButton
            color="outlined"
            icon={muted ? 'volume_off' : 'volume_up'}
            aria-pressed={!muted}
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? 'Mudo' : 'Som'}
          </AuroraButton>
          <AuroraButton color="outlined" onClick={() => cancelRef.current()}>
            Cancelar
          </AuroraButton>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function CalibrationBanner({
  sections,
  elapsedSec,
  marks,
  nextSectionIdx,
  onMarkNext,
  onSave,
  onCancel,
}: {
  sections: Section[];
  elapsedSec: number;
  marks: (number | null)[];
  nextSectionIdx: number;
  onMarkNext: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const markedCount = marks.filter((m) => m !== null).length;
  const nextSection = nextSectionIdx < sections.length ? sections[nextSectionIdx] : null;

  return (
    <div
      role="region"
      aria-label="Calibração da rolagem por seção"
      className="rounded-2xl bg-tertiary-container text-on-tertiary-container px-4 py-3 flex flex-wrap items-center justify-between gap-3"
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 font-mono typescale-title-md tabular-nums">
            <UiIcon name="radio_button_checked" size={20} className="text-error" />
            <span>{formatDuration(elapsedSec)}</span>
          </span>
          <span className="typescale-label-sm font-mono tabular-nums">
            {markedCount}/{sections.length} seções marcadas
          </span>
        </div>
        <p className="typescale-body-sm m-0">
          Toque ao entrar em cada seção (atalho Espaço) ou clique direto na seção abaixo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {nextSection ? (
          <AuroraButton color="filled" icon="flag" onClick={onMarkNext}>
            Marcar "{formatSectionLabel(nextSection.label)}"
          </AuroraButton>
        ) : (
          <span className="typescale-label-lg">Todas as seções marcadas</span>
        )}
        <AuroraButton
          color="primary-tonal"
          icon="check"
          disabled={markedCount < 2}
          onClick={onSave}
        >
          Salvar calibração
        </AuroraButton>
        <AuroraButton color="outlined" onClick={onCancel}>
          Cancelar
        </AuroraButton>
      </div>
    </div>
  );
}

export function SpotifyPanel({
  songTitle,
  songArtist,
  spotifyTrackId,
  showPreview,
  showPicker,
  onSelectTrack,
  onClearTrack,
  onClosePicker,
}: {
  songTitle: string;
  songArtist: string;
  spotifyTrackId: string | null;
  showPreview: boolean;
  showPicker: boolean;
  onSelectTrack: (track: SpotifyTrack) => void;
  onClearTrack: () => void;
  onClosePicker: () => void;
}) {
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [query, setQuery] = useState(`${songTitle} ${songArtist}`.trim());
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const q = `${songTitle} ${songArtist}`.trim();
    setQuery(q);
    setDismissed(false);
    if (!q || spotifyTrackId) return;
    let cancelled = false;
    fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data) => {
        if (!cancelled) setResults(data.results ?? []);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [songTitle, songArtist, spotifyTrackId]);

  const runSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showPicker && results.length === 0) {
      void runSearch(query);
    }
  }, [showPicker]);

  return (
    <>
      {showPreview && spotifyTrackId && (
        <div className="stage-card stage-toast p-3">
          <iframe
            key={spotifyTrackId}
            title="Prévia da faixa no Spotify"
            src={`https://open.spotify.com/embed/track/${spotifyTrackId}?utm_source=generator`}
            width="100%"
            height="152"
            style={{ border: 0, borderRadius: '16px' }}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        </div>
      )}

      {!spotifyTrackId && !dismissed && results.length > 0 && (
        <div className="rounded-2xl bg-primary-container/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="typescale-label-sm text-on-primary-container">
              Sugestão no Spotify
            </div>
            <div className="typescale-title-md text-on-surface truncate">
              {results[0].name} · {results[0].artist}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <AuroraButton
              color="filled"
              icon="headphones"
              onClick={() => onSelectTrack(results[0])}
            >
              Vincular
            </AuroraButton>
            <AuroraIconButton
              icon="close"
              label="Dispensar sugestão do Spotify"
              onClick={() => setDismissed(true)}
            />
          </div>
        </div>
      )}

      <AuroraDialog
        open={showPicker}
        onClose={onClosePicker}
        title="Vincular faixa do Spotify"
        subtitle="Ouça a prévia no ensaio e preencha a duração automaticamente"
      >
        <div className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
            className="flex flex-wrap gap-2"
          >
            <label htmlFor="spotify-picker-query" className="sr-only">
              Buscar música no Spotify
            </label>
            <input
              id="spotify-picker-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Título e artista..."
              className="stage-field flex-1 min-w-[200px]"
            />
            <AuroraButton type="submit" color="filled" icon="search" disabled={loading}>
              {loading ? 'Buscando...' : 'Buscar'}
            </AuroraButton>
          </form>

          {spotifyTrackId && (
            <div className="flex items-center justify-between rounded-2xl bg-surface-container-low px-4 py-3">
              <span className="typescale-body-sm text-on-surface-variant">
                Faixa vinculada (ID: {spotifyTrackId})
              </span>
              <AuroraButton
                color="danger"
                onClick={() => {
                  onClearTrack();
                  onClosePicker();
                }}
              >
                Desvincular
              </AuroraButton>
            </div>
          )}

          {results.length === 0 ? (
            <p className="typescale-body-sm text-on-surface-variant m-0">
              {loading
                ? 'Consultando Spotify...'
                : 'Nenhum resultado retornado. Verifique se as chaves do Spotify estão configuradas no servidor.'}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {results.map((track) => (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => {
                    onSelectTrack(track);
                    onClosePicker();
                  }}
                  className="stage-list-row w-full min-h-[52px] px-4 py-2.5 rounded-2xl bg-surface-container-low hover:bg-surface-container-high border-none flex items-center justify-between gap-3 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {track.albumArt ? (
                      <img
                        src={track.albumArt}
                        alt=""
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                      />
                    ) : (
                      <span className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant flex-shrink-0">
                        <UiIcon name="headphones" size={20} />
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="typescale-title-md text-on-surface truncate">{track.name}</div>
                      <div className="typescale-body-sm text-on-surface-variant truncate">
                        {track.artist}
                        {track.durationMs ? ` · ${formatDuration(Math.round(track.durationMs / 1000))}` : ''}
                      </div>
                    </div>
                  </div>
                  <UiIcon name="check_circle" size={22} className="text-primary flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </AuroraDialog>
    </>
  );
}

/**
 * Unified distraction-free stage chrome ("Tela limpa"), absorbing legacy Show Mode.
 * Constant-height 56px top bar + calm floating bottom dock with direct Tonalidade & Fonte
 * controls on tablet/desktop and unified upward Ajustes popover everywhere.
 */
export function CleanStageChrome({
  songTitle,
  displayedKey,
  capo,
  beatsPerBar,
  savedTempo,
  tempoConfirmed,
  stageNotes,
  wakeLockActive,
  scrolled,
  activeSetlist,
  setlistIdx,
  totalSetlistSongs,
  prevSongId,
  nextSongId,
  live,
  leadInLeft = 0,
  scrollLeadInSec = 0,
  onSkipLeadIn,
  audioBlocked,
  onUnlockAudio,
  onNavigateSong,
  onOpenSetlistDrawer,
  onTriggerCountIn,
  onSaveBpm,
  onRequestSaveTranspose,
  onGoLive,
  onToggleTheme,
  isDark,
  onEnterSlidesMode,
  onEnterEdit,
  onExit,
}: {
  songTitle: string;
  displayedKey: string;
  capo: number;
  beatsPerBar: number;
  savedTempo: number;
  tempoConfirmed: boolean;
  stageNotes: string;
  wakeLockActive: boolean;
  scrolled: boolean;
  activeSetlist: Setlist | null;
  setlistIdx: number;
  totalSetlistSongs: number;
  prevSongId: string | null;
  nextSongId: string | null;
  live: ReturnType<typeof useLiveSession>;
  leadInLeft?: number;
  scrollLeadInSec?: number;
  onSkipLeadIn?: () => void;
  audioBlocked: boolean;
  onUnlockAudio: () => void;
  onNavigateSong: (id: string) => void;
  onOpenSetlistDrawer: () => void;
  onTriggerCountIn: () => void;
  onSaveBpm: (bpm: number) => void;
  onRequestSaveTranspose: () => void;
  onGoLive: () => void;
  onToggleTheme: () => void;
  isDark: boolean;
  onEnterSlidesMode: () => void;
  onEnterEdit: () => void;
  onExit: () => void;
}) {
  const store = usePlayerStore();
  const { displayMode, setDisplayMode, fontSize, setFontSize, sheetColumns } = useDisplayStore();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const adjustWrapRef = useRef<HTMLDivElement>(null);
  const adjustTriggerRef = useRef<HTMLButtonElement>(null);
  const topKeyTriggerRef = useRef<HTMLButtonElement>(null);
  const adjustSourceRef = useRef<'top' | 'dock'>('dock');

  useEffect(() => {
    if (!adjustOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        adjustWrapRef.current &&
        !adjustWrapRef.current.contains(target) &&
        !(topKeyTriggerRef.current && topKeyTriggerRef.current.contains(target))
      ) {
        setAdjustOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setAdjustOpen(false);
        const targetBtn =
          adjustSourceRef.current === 'top' ? topKeyTriggerRef.current : adjustTriggerRef.current;
        targetBtn?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [adjustOpen]);

  const hasSetlist = Boolean(activeSetlist);
  const canNavigate = !live.isFollowing;
  const minor = isMinorKey(displayedKey);
  const transposeDelta =
    store.transpose > 0 ? `+${store.transpose}` : store.transpose < 0 ? `${store.transpose}` : '';

  const hasActiveAdjustments =
    store.transpose !== 0 ||
    fontSize !== 100 ||
    store.metronomeOn ||
    sheetColumns === 2 ||
    live.isLeading ||
    live.isFollowing;

  const scrollLabel = store.isAutoScrolling
    ? leadInLeft > 0
      ? `Em ${leadInLeft}s...`
      : 'Pausar'
    : 'Rolar';

  return (
    <>
      {/* Constant-height 56px slim top bar: never collapses, never shifts lyrics */}
      <header
        data-clean-topbar="true"
        className={`sticky top-0 z-30 flex-shrink-0 h-[56px] px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 border-b transition-colors ${
          scrolled
            ? 'bg-surface border-outline-variant/60'
            : 'bg-canvas border-transparent'
        }`}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          {activeSetlist && (
            <button
              type="button"
              onClick={onOpenSetlistDrawer}
              aria-haspopup="dialog"
              aria-label={`Abrir setlist ${activeSetlist.name} (${setlistIdx + 1} de ${totalSetlistSongs})`}
              title={`Abrir setlist ${activeSetlist.name} (S)`}
              className="stage-btn stage-btn-outlined h-9 min-h-[38px] px-2.5 font-mono typescale-label-sm tabular-nums flex-shrink-0"
            >
              <UiIcon name="queue_music" size={20} />
              <span>
                {setlistIdx + 1}/{totalSetlistSongs}
              </span>
            </button>
          )}

          <h1 className="typescale-title-lg text-on-surface m-0 truncate" title={songTitle}>
            {songTitle}
          </h1>

          {displayedKey && (
            <button
              ref={topKeyTriggerRef}
              type="button"
              data-gm3-focal="true"
              aria-expanded={adjustOpen}
              aria-haspopup="dialog"
              onClick={() => {
                adjustSourceRef.current = 'top';
                setAdjustOpen((v) => !v);
              }}
              className={`inline-flex items-center justify-center min-h-[36px] min-w-[44px] stage-touch-44 px-2.5 rounded-full font-mono typescale-label-sm flex-shrink-0 border-none cursor-pointer transition-opacity hover:opacity-90 ${
                minor
                  ? 'bg-minor-bg text-minor-ink'
                  : 'bg-primary-container text-on-primary-container'
              }`}
              title={`Tom ${displayedKey}${transposeDelta ? ` (${transposeDelta})` : ''}. Toque para ajustar`}
              aria-label={`Tom ${displayedKey}. Abrir ajustes de tonalidade e fonte`}
            >
              {displayedKey}
            </button>
          )}

          {wakeLockActive && (
            <span className="hidden md:inline-flex px-2.5 py-1 rounded-full bg-tertiary-container text-on-tertiary-container typescale-label-sm flex-shrink-0">
              Tela ativa
            </span>
          )}

          {hasSetlist && live.isLeading && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-error-container text-on-error-container typescale-label-sm flex-shrink-0">
              <UiIcon name="sensors" size={20} />
              Ao vivo
            </span>
          )}

          {hasSetlist && live.isFollowing && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-tertiary-container text-on-tertiary-container typescale-label-sm flex-shrink-0">
              Seguindo {live.session.leaderName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {store.metronomeOn && (
            <button
              type="button"
              onClick={() => (audioBlocked ? onUnlockAudio() : store.setMetronomeOn(false))}
              className={`inline-flex stage-btn h-9 min-h-[38px] px-2.5 font-mono typescale-label-sm tabular-nums ${
                audioBlocked ? 'bg-warn-bg text-warn-ink' : 'stage-btn-primary-tonal'
              }`}
              title={audioBlocked ? 'Toque para liberar o áudio do metrônomo' : 'Metrônomo ativo. Toque para parar'}
            >
              <UiIcon name={audioBlocked ? 'volume_up' : 'graphic_eq'} size={20} />
              <span>{audioBlocked ? 'Ativar som' : store.bpm}</span>
            </button>
          )}

          <AuroraButton
            color="outlined"
            icon="slideshow"
            aria-label="Slides"
            onClick={onEnterSlidesMode}
            className="hidden sm:inline-flex h-9 min-h-[38px] px-3"
          >
            <span>Slides</span>
          </AuroraButton>

          <AuroraButton
            color="tonal"
            icon="close_fullscreen"
            onClick={onExit}
            title="Voltar para a visão da música (Esc)"
            className="h-9 min-h-[38px] px-2.5 sm:px-3"
          >
            <span className="sm:hidden">Sair</span>
            <span className="hidden sm:inline">Sair da tela limpa</span>
          </AuroraButton>
        </div>
      </header>

      {stageNotes && (
        <aside aria-label="Notas de palco" className="flex-shrink-0 px-3 sm:px-6 lg:px-8 pt-1.5">
          <div className="flex items-center gap-2 typescale-body-sm text-warn-ink bg-warn-bg px-3 py-1.5 rounded-xl">
            <span className="typescale-label-sm flex-shrink-0">Deixa:</span>
            <span className="truncate">{stageNotes}</span>
          </div>
        </aside>
      )}

      {/* Calm unified floating bottom dock */}
      <nav
        aria-label="Controles da tela limpa"
        className="fixed bottom-3 sm:bottom-4 inset-x-0 z-30 flex justify-center px-2.5 sm:px-4 pointer-events-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          ref={adjustWrapRef}
          data-clean-dock="true"
          className="dock-enter-bottom stage-floating-bar relative pointer-events-auto flex items-center gap-1.5 sm:gap-2 rounded-full px-2 sm:px-3 py-1.5 max-w-full"
        >
          {/* 1. Setlist Prev / Next */}
          {hasSetlist && canNavigate && (
            <div className="inline-flex items-center gap-0.5 flex-shrink-0">
              <button
                type="button"
                disabled={!prevSongId}
                onClick={() => prevSongId && onNavigateSong(prevSongId)}
                aria-label="Música anterior"
                title="Música anterior (←)"
                className="dock-stepper-btn disabled:opacity-35"
              >
                <UiIcon name="skip_previous" size={20} />
              </button>
              <button
                type="button"
                disabled={!nextSongId}
                onClick={() => nextSongId && onNavigateSong(nextSongId)}
                aria-label="Próxima música"
                title="Próxima música (→)"
                className="dock-stepper-btn disabled:opacity-35"
              >
                <UiIcon name="skip_next" size={20} />
              </button>
            </div>
          )}

          {/* 2. Rolar + inline speed stepper only while scrolling */}
          {canNavigate && (
            <div className="inline-flex items-center gap-1 flex-shrink-0">
              <AuroraButton
                color={store.isAutoScrolling ? 'filled' : 'primary-tonal'}
                icon={
                  store.isAutoScrolling
                    ? leadInLeft > 0
                      ? 'hourglass_top'
                      : 'pause'
                    : 'play_arrow'
                }
                onClick={() => store.toggleAutoScroll()}
                aria-pressed={store.isAutoScrolling}
                aria-label={store.isAutoScrolling ? 'Pausar rolagem' : 'Iniciar rolagem'}
                className="relative overflow-hidden min-h-[40px] px-3 tabular-nums"
              >
                <span
                  key={leadInLeft > 0 ? `lead-${leadInLeft}` : store.isAutoScrolling ? 'run' : 'idle'}
                  className={leadInLeft > 0 ? 'countdown-tick' : 'countdown-tick hidden sm:inline'}
                >
                  {scrollLabel}
                </span>
                {leadInLeft > 0 && (
                  <span
                    aria-hidden="true"
                    className="leadin-bar absolute bottom-0 inset-x-0 h-[2px] bg-on-primary/70 origin-left"
                    style={{
                      transform: `scaleX(${Math.max(0.05, leadInLeft / Math.max(1, scrollLeadInSec))})`,
                    }}
                  />
                )}
              </AuroraButton>

              {leadInLeft > 0 && onSkipLeadIn && (
                <button
                  type="button"
                  onClick={onSkipLeadIn}
                  className="stage-btn stage-btn-tonal min-h-[40px] px-2.5 typescale-label-sm flex-shrink-0"
                >
                  Iniciar já
                </button>
              )}

              {store.isAutoScrolling && (
                <div className="hidden sm:inline-flex items-center gap-0.5 rounded-full bg-surface-container px-1">
                  <button
                    type="button"
                    aria-label="Diminuir velocidade"
                    onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed - 0.1)}
                    className="dock-stepper-btn"
                  >
                    <UiIcon name="remove" size={20} />
                  </button>
                  <span className="font-mono typescale-label-sm text-on-surface tabular-nums px-1 min-w-[34px] text-center">
                    {store.autoScrollSpeed.toFixed(1)}×
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar velocidade"
                    onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed + 0.1)}
                    className="dock-stepper-btn"
                  >
                    <UiIcon name="add" size={20} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 3. Unified Cifra | Letra | Acordes (full segmented on sm+, 1-tap mode pill on < sm so 320px/390px never clips) */}
          <div className="hidden sm:inline-flex flex-shrink-0">
            <AuroraSegmented<DisplayMode>
              ariaLabel="Modo de leitura na tela limpa"
              value={displayMode}
              onChange={setDisplayMode}
              options={[
                { value: 'both', label: 'Cifra' },
                { value: 'lyrics-only', label: 'Letra' },
                { value: 'chords-only', label: 'Acordes' },
              ]}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const order: DisplayMode[] = ['both', 'lyrics-only', 'chords-only'];
              setDisplayMode(order[(order.indexOf(displayMode) + 1) % order.length]);
            }}
            aria-label={`Modo de leitura: ${
              displayMode === 'both' ? 'Cifra' : displayMode === 'lyrics-only' ? 'Só letra' : 'Acordes'
            }. Toque para alternar`}
            className="sm:hidden stage-btn stage-btn-outlined min-h-[40px] px-3 typescale-label-sm flex-shrink-0"
          >
            {displayMode === 'both' ? 'Cifra' : displayMode === 'lyrics-only' ? 'Letra' : 'Acordes'}
          </button>

          {/* 4. Direct Tonalidade & Fonte quick steppers on md+ */}
          <div
            data-clean-transpose="true"
            role="group"
            aria-label="Ajustar tonalidade"
            className="hidden md:inline-flex items-center rounded-full bg-surface-container p-0.5 flex-shrink-0"
          >
            <button
              type="button"
              onClick={store.transposeDown}
              aria-label="Baixar meio tom"
              title="Baixar meio tom"
              className="dock-stepper-btn"
            >
              <UiIcon name="remove" size={20} />
            </button>
            <button
              type="button"
              disabled={store.transpose === 0}
              onClick={() => store.setTranspose(0)}
              className={`min-w-[38px] h-9 px-1.5 rounded-full font-mono typescale-label-sm tabular-nums border-none transition-colors ${
                store.transpose !== 0
                  ? minor
                    ? 'bg-minor-bg text-minor-ink cursor-pointer'
                    : 'bg-primary-container text-on-primary-container cursor-pointer'
                  : 'bg-transparent text-on-surface cursor-default'
              }`}
              title={
                store.transpose !== 0
                  ? `Tom ${displayedKey || transposeDelta}. Toque para voltar ao original`
                  : `Tom ${displayedKey || 'original'}`
              }
            >
              {displayedKey || transposeDelta || '0'}
            </button>
            <button
              type="button"
              onClick={store.transposeUp}
              aria-label="Subir meio tom"
              title="Subir meio tom"
              className="dock-stepper-btn"
            >
              <UiIcon name="add" size={20} />
            </button>
          </div>

          <div
            data-clean-font="true"
            role="group"
            aria-label="Ajustar tamanho da fonte"
            className="hidden md:inline-flex items-center rounded-full bg-surface-container p-0.5 flex-shrink-0"
          >
            <button
              type="button"
              disabled={fontSize <= 70}
              onClick={() => setFontSize(fontSize - 10)}
              aria-label="Diminuir fonte"
              title={`Diminuir fonte (${fontSize}%)`}
              className="dock-stepper-btn font-mono typescale-label-sm disabled:opacity-40"
            >
              A-
            </button>
            <button
              type="button"
              disabled={fontSize === 100}
              onClick={() => setFontSize(100)}
              className={`hidden lg:inline-flex items-center justify-center min-w-[44px] h-9 px-1 rounded-full font-mono typescale-label-sm tabular-nums border-none ${
                fontSize !== 100
                  ? 'bg-primary-container text-on-primary-container cursor-pointer'
                  : 'bg-transparent text-on-surface-variant cursor-default'
              }`}
              title={fontSize !== 100 ? 'Voltar para 100%' : 'Fonte padrão (100%)'}
            >
              {fontSize}%
            </button>
            <button
              type="button"
              disabled={fontSize >= 160}
              onClick={() => setFontSize(fontSize + 10)}
              aria-label="Aumentar fonte"
              title={`Aumentar fonte (${fontSize}%)`}
              className="dock-stepper-btn font-mono typescale-label-sm disabled:opacity-40"
            >
              A+
            </button>
          </div>

          {/* 5. Unified Ajustes trigger opening upward */}
          <button
            ref={adjustTriggerRef}
            type="button"
            data-clean-adjustments-trigger="true"
            onClick={() => {
              adjustSourceRef.current = 'dock';
              setAdjustOpen((v) => !v);
            }}
            aria-expanded={adjustOpen}
            aria-haspopup="dialog"
            aria-label="Ajustes da tela limpa"
            title="Ajustes (tonalidade, fonte, metrônomo, 1·2·3·4, tema)"
            className={`relative stage-btn min-h-[40px] px-2.5 xl:px-3 typescale-label-lg flex-shrink-0 ${
              adjustOpen ? 'stage-btn-tonal' : 'stage-btn-outlined'
            }`}
          >
            <UiIcon name="tune" size={20} />
            <span className="hidden xl:inline">Ajustes</span>
            {hasActiveAdjustments && (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 xl:static w-2 h-2 rounded-full bg-primary"
              />
            )}
          </button>

          {adjustOpen && (
            <div
              role="dialog"
              aria-label="Ajustes da tela limpa"
              data-clean-adjustments-popover="true"
              data-origin="bottom"
              className="stage-popover absolute right-0 bottom-[calc(100%+10px)] z-50 w-[min(336px,calc(100vw-24px))] max-h-[min(74vh,580px)] overflow-y-auto rounded-[24px] bg-surface border border-outline-variant p-4"
              style={{ boxShadow: 'var(--ui-elevation-overlay)' }}
            >
              {canNavigate && store.isAutoScrolling && (
                <div className="sm:hidden pb-3 mb-3 border-b border-outline-variant/50 flex items-center justify-between gap-2">
                  <span className="typescale-label-lg text-on-surface">Velocidade</span>
                  <div className="inline-flex items-center gap-1 rounded-full bg-surface-container p-0.5">
                    <button
                      type="button"
                      aria-label="Diminuir velocidade"
                      onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed - 0.1)}
                      className="dock-stepper-btn"
                    >
                      <UiIcon name="remove" size={20} />
                    </button>
                    <span className="font-mono typescale-label-sm text-on-surface tabular-nums px-2">
                      {store.autoScrollSpeed.toFixed(1)}×
                    </span>
                    <button
                      type="button"
                      aria-label="Aumentar velocidade"
                      onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed + 0.1)}
                      className="dock-stepper-btn"
                    >
                      <UiIcon name="add" size={20} />
                    </button>
                  </div>
                </div>
              )}

              <SongAdjustmentsPopover
                variant="clean"
                displayedKey={displayedKey}
                capo={capo}
                beatsPerBar={beatsPerBar}
                savedTempo={savedTempo}
                tempoConfirmed={tempoConfirmed}
                isFollowing={live.isFollowing}
                isDark={isDark}
                onToggleTheme={onToggleTheme}
                audioBlocked={audioBlocked}
                onUnlockAudio={onUnlockAudio}
                onSaveBpm={onSaveBpm}
                onRequestSaveTranspose={onRequestSaveTranspose}
                onTriggerCountIn={onTriggerCountIn}
                hasSetlist={hasSetlist}
                live={live}
                onGoLive={onGoLive}
                onEnterSlidesMode={onEnterSlidesMode}
                onEnterEdit={onEnterEdit}
                onClose={() => setAdjustOpen(false)}
              />
            </div>
          )}
        </div>
      </nav>
    </>
  );
}

export function SongMetaDialog({
  open,
  song,
  onClose,
  onSave,
}: {
  open: boolean;
  song: ParsedSong;
  onClose: () => void;
  onSave: (updates: {
    title: string;
    artist: string;
    key: string;
    capo: number;
    tempo: number;
    timeSignature: string;
    durationSec: number | null;
  }) => void;
}) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [key, setKey] = useState(song.originalKey);
  const [capoStr, setCapoStr] = useState(String(song.capo));
  const [tempoStr, setTempoStr] = useState(String(song.tempo));
  const [timeSignature, setTimeSignature] = useState(song.timeSignature || '4/4');
  const [durationStr, setDurationStr] = useState(
    song.duration ? formatDuration(song.duration) : ''
  );

  useEffect(() => {
    if (!open) return;
    setTitle(song.title);
    setArtist(song.artist);
    setKey(song.originalKey);
    setCapoStr(String(song.capo));
    setTempoStr(String(song.tempo));
    setTimeSignature(song.timeSignature || '4/4');
    setDurationStr(song.duration ? formatDuration(song.duration) : '');
  }, [open, song]);

  return (
    <AuroraDialog
      open={open}
      onClose={onClose}
      title="Renomear e editar dados"
      subtitle="Atualiza título, artista, tom original, capotraste, BPM, compasso e duração"
      maxWidth="max-w-lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          const parsedCapo = parseInt(capoStr, 10);
          const parsedTempo = parseInt(tempoStr, 10);
          onSave({
            title: title.trim(),
            artist: artist.trim(),
            key: key.trim(),
            capo: Math.max(0, Math.min(12, Number.isFinite(parsedCapo) ? parsedCapo : 0)),
            tempo: Math.max(40, Math.min(240, Number.isFinite(parsedTempo) ? parsedTempo : 120)),
            timeSignature,
            durationSec: durationStr.trim() ? parseDurationValue(durationStr.trim()) : null,
          });
          onClose();
        }}
        className="space-y-4"
      >
        <div className="space-y-1">
          <label htmlFor="edit-meta-title" className="typescale-label-sm text-on-surface-variant block">
            Título
          </label>
          <input
            id="edit-meta-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="stage-field"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="edit-meta-artist" className="typescale-label-sm text-on-surface-variant block">
            Artista
          </label>
          <input
            id="edit-meta-artist"
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            className="stage-field"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label htmlFor="edit-meta-key" className="typescale-label-sm text-on-surface-variant block">
              Tom
            </label>
            <input
              id="edit-meta-key"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Ex.: Gm"
              className="stage-field font-mono"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-meta-capo" className="typescale-label-sm text-on-surface-variant block">
              Capo (0-12)
            </label>
            <input
              id="edit-meta-capo"
              type="number"
              inputMode="numeric"
              min={0}
              max={12}
              value={capoStr}
              onChange={(e) => setCapoStr(e.target.value)}
              className="stage-field font-mono"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-meta-bpm" className="typescale-label-sm text-on-surface-variant block">
              BPM
            </label>
            <input
              id="edit-meta-bpm"
              type="number"
              inputMode="numeric"
              min={40}
              max={240}
              value={tempoStr}
              onChange={(e) => setTempoStr(e.target.value)}
              className="stage-field font-mono"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-meta-time" className="typescale-label-sm text-on-surface-variant block">
              Compasso
            </label>
            <select
              id="edit-meta-time"
              value={timeSignature}
              onChange={(e) => setTimeSignature(e.target.value)}
              className="stage-field font-mono"
            >
              <option value="4/4">4/4</option>
              <option value="3/4">3/4</option>
              <option value="6/8">6/8</option>
              <option value="2/4">2/4</option>
              <option value="5/4">5/4</option>
              <option value="7/8">7/8</option>
            </select>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="edit-meta-dur" className="typescale-label-sm text-on-surface-variant block">
              Duração (mm:ss)
            </label>
            <input
              id="edit-meta-dur"
              type="text"
              value={durationStr}
              onChange={(e) => setDurationStr(e.target.value)}
              placeholder="3:45"
              className="stage-field font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant">
          <AuroraButton color="outlined" onClick={onClose}>
            Cancelar
          </AuroraButton>
          <AuroraButton type="submit" color="filled" icon="check">
            Salvar dados
          </AuroraButton>
        </div>
      </form>
    </AuroraDialog>
  );
}
