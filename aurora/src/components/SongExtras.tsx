import { useEffect, useState } from 'react';
import type { ParsedSong, Section } from '@/lib/types/song';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { formatDuration, parseDurationValue } from '@/lib/utils/chordpro-parser';
import { isMinorKey } from '@/lib/utils/music';
import { playReferencePitch } from '@/lib/utils/pitch-audio';
import {
  AuroraButton,
  AuroraDialog,
  AuroraIconButton,
  UiIcon,
} from '../aurora/primitives';

export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  album?: string;
  albumArt?: string | null;
  durationMs?: number;
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
            Marcar "{nextSection.label}"
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
                  <div className="min-w-0">
                    <div className="typescale-title-md text-on-surface truncate">{track.name}</div>
                    <div className="typescale-body-sm text-on-surface-variant truncate">
                      {track.artist}
                      {track.durationMs ? ` · ${formatDuration(Math.round(track.durationMs / 1000))}` : ''}
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

export function FocusModeChrome({
  songTitle,
  displayedKey,
  stageNotes,
  wakeLockActive,
  hasSetlist,
  prevSongId,
  nextSongId,
  isFollowing,
  leadInLeft = 0,
  scrollLeadInSec = 0,
  onNavigateSong,
  onOpenSetlistDrawer,
  onTriggerCountIn,
  onToggleTheme,
  isDark,
  onExit,
}: {
  songTitle: string;
  displayedKey: string;
  stageNotes: string;
  wakeLockActive: boolean;
  hasSetlist: boolean;
  prevSongId: string | null;
  nextSongId: string | null;
  isFollowing: boolean;
  leadInLeft?: number;
  scrollLeadInSec?: number;
  onNavigateSong: (id: string) => void;
  onOpenSetlistDrawer: () => void;
  onTriggerCountIn: () => void;
  onToggleTheme: () => void;
  isDark: boolean;
  onExit: () => void;
}) {
  const store = usePlayerStore();
  const { displayMode, toggleHideChords, fontSize, setFontSize } = useDisplayStore();
  const lyricsOnly = displayMode === 'lyrics-only';
  const minor = isMinorKey(displayedKey);
  const scrollLabel = store.isAutoScrolling
    ? leadInLeft > 0
      ? `Em ${leadInLeft}s...`
      : 'Pausar'
    : 'Rolar';

  return (
    <>
      <header className="dock-enter-top stage-floating-bar sticky top-3 z-30 rounded-[22px] px-4 sm:px-5 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {hasSetlist && (
              <AuroraIconButton
                icon="queue_music"
                label="Abrir setlist (S)"
                onClick={onOpenSetlistDrawer}
              />
            )}
            <h1 className="typescale-title-lg text-on-surface m-0 truncate">{songTitle}</h1>
            {displayedKey && !lyricsOnly && (
              <span
                className={`px-2.5 py-1 rounded-full font-mono typescale-label-sm flex-shrink-0 ${
                  minor
                    ? 'bg-surface text-minor-ink border border-outline-variant'
                    : 'bg-primary-container text-on-primary-container'
                }`}
              >
                {displayedKey}
              </span>
            )}
            {wakeLockActive && (
              <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full bg-tertiary-container text-on-tertiary-container typescale-label-sm flex-shrink-0">
                Tela ativa
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <AuroraIconButton
              icon={isDark ? 'light_mode' : 'dark_mode'}
              label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              onClick={onToggleTheme}
            />
            <AuroraButton color="tonal" icon="close_fullscreen" onClick={onExit}>
              <span className="sm:hidden">Sair</span>
              <span className="hidden sm:inline">Sair da tela limpa</span>
            </AuroraButton>
          </div>
        </div>

        {stageNotes && (
          <div className="flex items-center gap-2 typescale-body-sm text-warn-ink bg-warn-bg px-3 py-1.5 rounded-xl">
            <span className="typescale-label-sm">Deixa:</span>
            <span className="truncate">{stageNotes}</span>
          </div>
        )}
      </header>

      {/* Unified borderless floating bottom dock */}
      <div
        className="fixed bottom-4 inset-x-0 z-30 flex justify-center px-3 pointer-events-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          className="dock-enter-bottom stage-floating-bar pointer-events-auto flex items-center gap-1 flex-wrap justify-center rounded-[28px] sm:rounded-full px-2.5 py-1.5"
        >
          {hasSetlist && !isFollowing && (
            <>
              <AuroraIconButton
                icon="skip_previous"
                label="Música anterior"
                disabled={!prevSongId}
                onClick={() => prevSongId && onNavigateSong(prevSongId)}
                className="text-on-surface"
              />
              <AuroraIconButton
                icon="skip_next"
                label="Próxima música"
                disabled={!nextSongId}
                onClick={() => nextSongId && onNavigateSong(nextSongId)}
                className="text-on-surface"
              />
            </>
          )}
          <AuroraButton
            color={store.isAutoScrolling ? 'filled' : 'primary-tonal'}
            icon={store.isAutoScrolling ? (leadInLeft > 0 ? 'hourglass_top' : 'pause') : 'play_arrow'}
            disabled={isFollowing}
            onClick={() => store.toggleAutoScroll()}
            className="relative overflow-hidden min-w-[104px] tabular-nums"
          >
            <span
              key={leadInLeft > 0 ? `lead-${leadInLeft}` : store.isAutoScrolling ? 'run' : 'idle'}
              className="countdown-tick"
            >
              {scrollLabel}
            </span>
            {leadInLeft > 0 && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 inset-x-0 h-[2px] bg-on-primary/70 origin-left"
                style={{
                  transform: `scaleX(${Math.max(0.05, leadInLeft / Math.max(1, scrollLeadInSec))})`,
                  transition: 'transform 950ms linear',
                }}
              />
            )}
          </AuroraButton>
          {displayedKey && (
            <AuroraIconButton
              icon="volume_up"
              label={`Tocar acorde guia ${displayedKey}`}
              onClick={() => playReferencePitch(displayedKey, { mode: 'chord' })}
              className="text-on-surface"
            />
          )}
          <AuroraButton
            color="text"
            icon="looks_4"
            aria-label="Contagem visual (C)"
            title="Contagem visual (C)"
            onClick={onTriggerCountIn}
            className="text-on-surface"
          >
            <span className="hidden sm:inline">Contagem</span>
          </AuroraButton>
          <AuroraButton
            color={lyricsOnly ? 'tonal' : 'text'}
            aria-label={
              lyricsOnly
                ? 'Letra: modo somente letra ativo, alternar para cifra'
                : 'Cifra: alternar para somente letra'
            }
            aria-pressed={lyricsOnly}
            onClick={toggleHideChords}
            className={lyricsOnly ? '' : 'text-on-surface'}
          >
            {lyricsOnly ? 'Letra' : 'Cifra'}
          </AuroraButton>
          <AuroraIconButton
            icon="text_decrease"
            label="Diminuir fonte"
            disabled={fontSize <= 70}
            onClick={() => setFontSize(fontSize - 10)}
            className="text-on-surface"
          />
          <AuroraIconButton
            icon="text_increase"
            label="Aumentar fonte"
            disabled={fontSize >= 160}
            onClick={() => setFontSize(fontSize + 10)}
            className="text-on-surface"
          />
        </div>
      </div>
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
    durationSec: number | null;
    rating: number;
  }) => void;
}) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [key, setKey] = useState(song.originalKey);
  const [capoStr, setCapoStr] = useState(String(song.capo));
  const [tempoStr, setTempoStr] = useState(String(song.tempo));
  const [durationStr, setDurationStr] = useState(
    song.duration ? formatDuration(song.duration) : ''
  );
  const [rating, setRating] = useState(song.rating);

  useEffect(() => {
    if (!open) return;
    setTitle(song.title);
    setArtist(song.artist);
    setKey(song.originalKey);
    setCapoStr(String(song.capo));
    setTempoStr(String(song.tempo));
    setDurationStr(song.duration ? formatDuration(song.duration) : '');
    setRating(song.rating);
  }, [open, song]);

  return (
    <AuroraDialog
      open={open}
      onClose={onClose}
      title="Editar dados da música"
      subtitle="Atualiza título, artista, tom original, capotraste, BPM, duração e estrelas"
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
            durationSec: durationStr.trim() ? parseDurationValue(durationStr.trim()) : null,
            rating,
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            <label htmlFor="edit-meta-dur" className="typescale-label-sm text-on-surface-variant block">
              Duração
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

        <div className="space-y-1.5">
          <span className="typescale-label-sm text-on-surface-variant block">Avaliação</span>
          <div className="flex items-center gap-1" role="group" aria-label="Avaliação em estrelas">
            {[1, 2, 3, 4, 5].map((star) => (
              <AuroraIconButton
                key={star}
                icon="star"
                filled={star <= rating}
                label={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
                aria-pressed={star <= rating}
                className={star <= rating ? 'text-warn-icon' : ''}
                onClick={() => setRating((curr) => (curr === star ? 0 : star))}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant">
          <AuroraButton color="outlined" onClick={onClose}>
            Cancelar
          </AuroraButton>
          <AuroraButton type="submit" color="filled" icon="check">
            Salvar metadados
          </AuroraButton>
        </div>
      </form>
    </AuroraDialog>
  );
}
