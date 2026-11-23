'use client';

import { useRef, useState, type CSSProperties } from 'react';
import type { SpotifyTrackResult } from '@/lib/spotify';
import { useSpotifyPlayer } from '@/lib/hooks/use-spotify-player';
import {
  CloseIcon,
  HeadphonesIcon,
  PauseIcon,
  PlayIcon,
  VolumeIcon,
} from '@/components/ui/Icons';

interface SpotifyWebPlayerProps {
  spotifyTrackId: string;
  songTitle?: string;
  songArtist?: string;
  matchedTrack?: SpotifyTrackResult | null;
  oauthError?: string | null;
  onDismissOauthError?: () => void;
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatOauthError(code: string | null | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'access_denied':
      return 'Login cancelado no Spotify.';
    case 'not_configured':
      return 'Credenciais do Spotify não configuradas no servidor.';
    case 'invalid_state':
      return 'Falha de segurança ao autenticar (state inválido). Tente novamente.';
    case 'token_exchange_failed':
      return 'Falha ao concluir a autenticação com o Spotify. Tente novamente.';
    default:
      return 'Não foi possível conectar ao Spotify.';
  }
}

export function SpotifyWebPlayer({
  spotifyTrackId,
  songTitle,
  songArtist,
  matchedTrack = null,
  oauthError = null,
  onDismissOauthError,
}: SpotifyWebPlayerProps) {
  const [mode, setMode] = useState<'sdk' | 'embed'>('sdk');
  const pointerDraggingRef = useRef(false);

  const player = useSpotifyPlayer({
    trackId: spotifyTrackId,
    enabled: mode === 'sdk',
  });

  const translatedOauthError = formatOauthError(oauthError);
  const displayTitle = player.activeTrack?.name || matchedTrack?.name || songTitle || 'Faixa no Spotify';
  const displayArtist = player.activeTrack?.artist || matchedTrack?.artist || songArtist || '';
  const displayArt = player.activeTrack?.albumArt || matchedTrack?.albumArt || null;

  const effectiveDurationMs = player.durationMs || matchedTrack?.durationMs || 0;
  const clampedPosMs =
    effectiveDurationMs > 0 ? Math.min(player.positionMs, effectiveDurationMs) : 0;
  const seekPercent =
    effectiveDurationMs > 0 ? Math.min(100, Math.max(0, (clampedPosMs / effectiveDurationMs) * 100)) : 0;
  const volumePercent = player.muted ? 0 : Math.round(player.volume * 100);

  const loopLabel =
    player.loopA !== null && player.loopB !== null
      ? `Loop ${formatMs(player.loopA)}–${formatMs(player.loopB)}`
      : player.loopA !== null
      ? `A ${formatMs(player.loopA)} → B`
      : 'Loop A-B';

  const loopLeftPct =
    player.loopA !== null && player.loopB !== null && effectiveDurationMs > 0
      ? Math.max(0, Math.min(100, (player.loopA / effectiveDurationMs) * 100))
      : 0;
  const loopWidthPct =
    player.loopA !== null && player.loopB !== null && effectiveDurationMs > 0
      ? Math.max(0, Math.min(100 - loopLeftPct, ((player.loopB - player.loopA) / effectiveDurationMs) * 100))
      : 0;

  if (mode === 'embed') {
    return (
      <div className="rounded-[20px] bg-[var(--surface)] border border-[var(--line-subtle)]/45 p-3.5 sm:p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="field-label">Spotify · Embed simples</span>
          <button
            type="button"
            onClick={() => setMode('sdk')}
            className="pill-btn bg-[var(--bg)] h-8 px-3 text-xs"
          >
            Usar Web SDK
          </button>
        </div>
        <iframe
          key={spotifyTrackId}
          title="Prévia da faixa no Spotify"
          src={`https://open.spotify.com/embed/track/${spotifyTrackId}?utm_source=generator`}
          width="100%"
          height="152"
          style={{ border: 0, borderRadius: '14px' }}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      </div>
    );
  }

  if (player.authStatus === 'loading') {
    return (
      <div className="rounded-[20px] bg-[var(--surface)] border border-[var(--line-subtle)]/45 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--surface-high)] flex items-center justify-center text-[var(--muted)] flex-shrink-0">
          <HeadphonesIcon size={18} />
        </div>
        <span className="text-xs font-mono text-[var(--muted)]">Verificando sessão do Spotify…</span>
      </div>
    );
  }

  if (player.authStatus === 'unauthenticated') {
    const authMessage = player.error || translatedOauthError;
    return (
      <div className="rounded-[20px] bg-[var(--surface)] border border-[var(--line-subtle)]/45 p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {displayArt ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayArt}
                alt=""
                width={44}
                height={44}
                className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-[var(--primary-container)] text-[var(--on-primary-container)] flex items-center justify-center flex-shrink-0">
                <HeadphonesIcon size={18} />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-display font-semibold text-[var(--ink)] truncate">
                {displayTitle}
                {displayArtist && (
                  <span className="font-normal text-[var(--muted)]"> · {displayArtist}</span>
                )}
              </div>
              <p className="text-xs text-[var(--muted)] leading-snug mt-0.5">
                Conecte sua conta Spotify Premium para tocar a faixa completa com busca, -10s/+10s e Loop A-B.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={player.login}
              className="pill-btn pill-btn-primary h-10 px-4 text-xs"
            >
              Conectar Spotify
            </button>
            <button
              type="button"
              onClick={() => setMode('embed')}
              className="pill-btn bg-[var(--bg)] h-10 px-3.5 text-xs"
            >
              Usar embed simples
            </button>
          </div>
        </div>

        {authMessage && (
          <div
            role="alert"
            className="rounded-xl bg-[var(--rec-dim)] text-[var(--on-rec-container)] px-3 py-2 text-xs font-medium flex items-center justify-between gap-2"
          >
            <span>{authMessage}</span>
            {oauthError && onDismissOauthError && (
              <button
                type="button"
                onClick={onDismissOauthError}
                aria-label="Dispensar aviso do Spotify"
                className="gm3-icon-btn w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/10 cursor-pointer flex-shrink-0"
              >
                <CloseIcon size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const premiumNotice =
    player.error ||
    (player.requiresPremium
      ? 'Esta conta não possui Spotify Premium. O Web Playback SDK exige Premium para tocar faixas completas.'
      : null);

  return (
    <div className="rounded-[20px] bg-[var(--surface)] border border-[var(--line-subtle)]/45 p-3.5 sm:p-4 space-y-2.5">
      {/* Top row: artwork, track info, SDK status, fallback & logout */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {displayArt ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayArt}
              alt=""
              width={40}
              height={40}
              className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-[var(--primary-container)] text-[var(--on-primary-container)] flex items-center justify-center flex-shrink-0">
              <HeadphonesIcon size={17} />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="text-sm font-display font-semibold text-[var(--ink)] truncate">
              {displayTitle}
            </div>
            {displayArtist && (
              <div className="text-xs text-[var(--muted)] truncate">{displayArtist}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className={`studio-chip text-[11px] ${
              player.sdkReady
                ? 'bg-[var(--tune-dim)] text-[var(--tune)]'
                : 'bg-[var(--surface-high)] text-[var(--muted)]'
            }`}
          >
            {player.sdkReady ? 'Web SDK' : 'Conectando player…'}
            {player.sdkReady && player.user?.displayName && (
              <span className="hidden sm:inline opacity-80"> · {player.user.displayName}</span>
            )}
          </span>

          <button
            type="button"
            onClick={() => setMode('embed')}
            className="pill-btn bg-[var(--bg)] h-8 px-2.5 text-xs"
            title="Alternar para o embed simples do Spotify"
          >
            Embed
          </button>

          <button
            type="button"
            onClick={() => void player.logout()}
            className="pill-btn bg-[var(--bg)] h-8 px-2.5 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Desconectar
          </button>
        </div>
      </div>

      {/* Error / Premium warning banner */}
      {premiumNotice && (
        <div
          role="alert"
          className="rounded-xl bg-[var(--rec-dim)] text-[var(--on-rec-container)] px-3 py-2 text-xs font-medium flex flex-wrap items-center justify-between gap-2"
        >
          <span>{premiumNotice}</span>
          <button
            type="button"
            onClick={() => setMode('embed')}
            className="pill-btn bg-[var(--surface)] h-7 px-2.5 text-[11px]"
          >
            Abrir embed simples
          </button>
        </div>
      )}

      {/* Playback controls row */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!player.sdkReady || player.isStarting}
          onClick={() => void player.togglePlay()}
          aria-label={
            player.isCurrentTrackActive && !player.isPaused
              ? 'Pausar música no Spotify'
              : 'Tocar música no Spotify'
          }
          className="pill-btn pill-btn-primary w-11 h-11 rounded-full p-0 flex-shrink-0"
        >
          {player.isCurrentTrackActive && !player.isPaused ? (
            <PauseIcon size={17} />
          ) : (
            <PlayIcon size={17} />
          )}
        </button>

        <div className="gm3-btn-group flex-shrink-0">
          <button
            type="button"
            disabled={!player.sdkReady}
            onClick={() => void player.skipBy(-10_000)}
            className="pill-btn bg-[var(--bg)] h-9 px-2.5 font-mono text-xs"
            title="Voltar 10 segundos"
          >
            -10s
          </button>
          <button
            type="button"
            disabled={!player.sdkReady}
            onClick={() => void player.skipBy(10_000)}
            className="pill-btn bg-[var(--bg)] h-9 px-2.5 font-mono text-xs"
            title="Avançar 10 segundos"
          >
            +10s
          </button>
        </div>

        <div className="inline-flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            disabled={!player.sdkReady || !player.isCurrentTrackActive}
            aria-pressed={player.loopA !== null}
            onClick={player.cycleLoop}
            className={`pill-btn h-9 px-3 text-xs font-mono ${
              player.loopA !== null && player.loopB !== null
                ? 'pill-btn-tune'
                : player.loopA !== null
                ? 'pill-btn-tonal'
                : 'bg-[var(--bg)]'
            }`}
            title={
              player.loopA === null
                ? 'Marcar início do loop (A)'
                : player.loopB === null
                ? 'Marcar fim do loop (B)'
                : 'Desativar loop A-B'
            }
          >
            {loopLabel}
          </button>
          {player.loopA !== null && (
            <button
              type="button"
              onClick={player.clearLoop}
              aria-label="Limpar loop A-B"
              title="Limpar loop A-B"
              className="gm3-icon-btn w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
            >
              <CloseIcon size={13} />
            </button>
          )}
        </div>

        <div className="flex-1 min-w-[8px]" />

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            disabled={!player.sdkReady}
            onClick={() => void player.toggleMute()}
            aria-label={player.muted || volumePercent === 0 ? 'Ativar som' : 'Silenciar'}
            className="gm3-icon-btn w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
          >
            <VolumeIcon size={15} muted={player.muted || volumePercent === 0} />
          </button>
          <input
            type="range"
            className="gm3-range w-20 sm:w-24"
            min={0}
            max={100}
            step={1}
            disabled={!player.sdkReady}
            value={volumePercent}
            aria-label="Volume do Spotify"
            aria-valuetext={`${volumePercent}%`}
            style={{ '--slider-progress': `${volumePercent}%` } as CSSProperties}
            onChange={(e) => {
              void player.setVolumeLevel(Number(e.target.value) / 100);
            }}
          />
        </div>
      </div>

      {/* Seek bar row */}
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-xs text-[var(--muted)] tabular-nums w-10 text-right flex-shrink-0">
          {formatMs(clampedPosMs)}
        </span>

        <div className="relative flex-1 flex items-center">
          {player.loopA !== null && player.loopB !== null && effectiveDurationMs > 0 && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-[7px] rounded-full bg-[var(--tune)]/35"
              style={{
                left: `${loopLeftPct}%`,
                width: `${loopWidthPct}%`,
              }}
            />
          )}
          <input
            type="range"
            className="gm3-range w-full relative z-[1]"
            min={0}
            max={Math.max(1, effectiveDurationMs)}
            step={500}
            disabled={!player.sdkReady || effectiveDurationMs <= 0}
            value={clampedPosMs}
            aria-label="Posição da faixa no Spotify"
            aria-valuetext={`${formatMs(clampedPosMs)} de ${formatMs(effectiveDurationMs)}`}
            style={{ '--slider-progress': `${seekPercent}%` } as CSSProperties}
            onPointerDown={() => {
              pointerDraggingRef.current = true;
              player.setScrubbing(true);
            }}
            onChange={(e) => {
              const val = Number(e.target.value);
              player.previewPosition(val);
              if (!pointerDraggingRef.current) {
                void player.seek(val);
              }
            }}
            onPointerUp={(e) => {
              if (pointerDraggingRef.current) {
                pointerDraggingRef.current = false;
                player.setScrubbing(false);
                void player.seek(Number(e.currentTarget.value));
              }
            }}
            onPointerCancel={() => {
              pointerDraggingRef.current = false;
              player.setScrubbing(false);
            }}
          />
        </div>

        <span className="font-mono text-xs text-[var(--muted)] tabular-nums w-10 flex-shrink-0">
          {effectiveDurationMs > 0 ? formatMs(effectiveDurationMs) : '--:--'}
        </span>
      </div>
    </div>
  );
}
