'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpotifyPlayer, SpotifyUserProfile } from '@/lib/types/spotify-sdk';

export type SpotifyAuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

export interface ActiveSpotifyTrack {
  name: string;
  artist: string;
  albumArt: string | null;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface TokenApiResponse {
  authenticated: boolean;
  accessToken?: string;
  expiresAt?: number;
  user?: SpotifyUserProfile | null;
  error?: string;
}

const SPOTIFY_SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
let sdkLoadPromise: Promise<void> | null = null;

function loadSpotifySdk(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window unavailable'));
  }
  if (window.Spotify?.Player) {
    return Promise.resolve();
  }
  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const previousReady = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      previousReady?.();
      resolve();
    };

    const existing = document.getElementById('spotify-player-sdk') as HTMLScriptElement | null;
    if (existing) {
      if (window.Spotify?.Player) {
        resolve();
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'spotify-player-sdk';
    script.src = SPOTIFY_SDK_URL;
    script.async = true;
    script.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error('Não foi possível carregar o SDK do Spotify.'));
    };
    document.body.appendChild(script);
  });

  return sdkLoadPromise;
}

export function useSpotifyPlayer({
  trackId,
  enabled,
}: {
  trackId: string;
  enabled: boolean;
}) {
  const [authStatus, setAuthStatus] = useState<SpotifyAuthStatus>('loading');
  const [user, setUser] = useState<SpotifyUserProfile | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isCurrentTrackActive, setIsCurrentTrackActive] = useState(false);
  const [activeTrack, setActiveTrack] = useState<ActiveSpotifyTrack | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requiresPremium, setRequiresPremium] = useState(false);

  const tokenCacheRef = useRef<TokenCache | null>(null);
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const trackIdRef = useRef(trackId);
  const deviceIdRef = useRef<string | null>(null);
  const volumeRef = useRef(volume);
  const lastNonZeroVolumeRef = useRef(0.8);
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const anchorPosRef = useRef(0);
  const anchorTimeRef = useRef(0);
  const scrubbingRef = useRef(false);
  const loopARef = useRef<number | null>(null);
  const loopBRef = useRef<number | null>(null);
  const lastLoopSeekAtRef = useRef(0);

  useEffect(() => {
    trackIdRef.current = trackId;
  }, [trackId]);

  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    positionRef.current = positionMs;
  }, [positionMs]);

  useEffect(() => {
    durationRef.current = durationMs;
  }, [durationMs]);

  useEffect(() => {
    loopARef.current = loopA;
    loopBRef.current = loopB;
  }, [loopA, loopB]);

  const fetchFreshToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    const cached = tokenCacheRef.current;
    if (!forceRefresh && cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.token;
    }

    try {
      const res = await fetch('/api/spotify/token', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = (await res.json()) as TokenApiResponse;
      if (!data.authenticated || !data.accessToken) {
        tokenCacheRef.current = null;
        setAuthStatus('unauthenticated');
        return null;
      }
      tokenCacheRef.current = {
        token: data.accessToken,
        expiresAt: data.expiresAt ?? Date.now() + 3000_000,
      };
      if (data.user) {
        setUser(data.user);
        setRequiresPremium(Boolean(data.user.product && data.user.product !== 'premium'));
      }
      return data.accessToken;
    } catch {
      return null;
    }
  }, []);

  const fetchFreshTokenRef = useRef(fetchFreshToken);
  useEffect(() => {
    fetchFreshTokenRef.current = fetchFreshToken;
  }, [fetchFreshToken]);

  // 1. Check OAuth session status when SDK mode is enabled
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    fetch('/api/spotify/token', { cache: 'no-store' })
      .then((res) => res.json() as Promise<TokenApiResponse>)
      .then((data) => {
        if (cancelled) return;
        if (data.authenticated && data.accessToken) {
          tokenCacheRef.current = {
            token: data.accessToken,
            expiresAt: data.expiresAt ?? Date.now() + 3000_000,
          };
          setUser(data.user ?? null);
          setRequiresPremium(Boolean(data.user?.product && data.user.product !== 'premium'));
          setAuthStatus('authenticated');
        } else {
          tokenCacheRef.current = null;
          setUser(null);
          setAuthStatus('unauthenticated');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthStatus('unauthenticated');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // 2. Lazily load Spotify Web Playback SDK and register the browser device
  useEffect(() => {
    if (!enabled || authStatus !== 'authenticated') return;
    let cancelled = false;
    let localPlayer: SpotifyPlayer | null = null;

    loadSpotifySdk()
      .then(() => {
        if (cancelled || !window.Spotify?.Player) return;

        const player = new window.Spotify.Player({
          name: 'Jamshelf',
          getOAuthToken: (cb) => {
            void fetchFreshTokenRef.current().then((token) => {
              if (token) cb(token);
            });
          },
          volume: volumeRef.current,
        });

        localPlayer = player;
        playerRef.current = player;

        player.addListener('ready', ({ device_id }) => {
          if (cancelled) return;
          deviceIdRef.current = device_id;
          setDeviceId(device_id);
          setSdkReady(true);
          setError(null);
        });

        player.addListener('not_ready', () => {
          if (cancelled) return;
          setSdkReady(false);
        });

        player.addListener('player_state_changed', (state) => {
          if (cancelled) return;
          if (!state) {
            setIsPaused(true);
            return;
          }
          const track = state.track_window?.current_track;
          const matchesCurrent = Boolean(
            track &&
              (track.id === trackIdRef.current ||
                track.uri === `spotify:track:${trackIdRef.current}`)
          );

          if (!matchesCurrent) {
            setIsCurrentTrackActive(false);
            setIsPaused(true);
            return;
          }

          anchorPosRef.current = state.position;
          anchorTimeRef.current = performance.now();
          setIsCurrentTrackActive(true);
          setIsPaused(state.paused);
          setDurationMs(state.duration || track.duration_ms || 0);
          if (!scrubbingRef.current) {
            setPositionMs(state.position);
          }
          setActiveTrack({
            name: track.name,
            artist: track.artists.map((a) => a.name).join(', '),
            albumArt: track.album.images?.[0]?.url ?? null,
          });
        });

        player.addListener('account_error', () => {
          if (cancelled) return;
          setRequiresPremium(true);
          setError('O Web Playback SDK exige uma conta Spotify Premium.');
        });

        player.addListener('authentication_error', () => {
          if (cancelled) return;
          tokenCacheRef.current = null;
          setAuthStatus('unauthenticated');
          setSdkReady(false);
          setError('Sessão do Spotify expirada. Conecte novamente.');
        });

        player.addListener('initialization_error', ({ message }) => {
          if (cancelled) return;
          setError(message || 'Navegador sem suporte ao player Web Playback SDK (DRM).');
        });

        player.addListener('playback_error', ({ message }) => {
          if (cancelled) return;
          setError(message || 'Falha ao reproduzir a faixa no Spotify.');
        });

        void player.connect().then((connected) => {
          if (!connected && !cancelled) {
            setError('Não foi possível conectar ao player do Spotify.');
          }
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar o player do Spotify.');
        }
      });

    return () => {
      cancelled = true;
      if (localPlayer) {
        localPlayer.pause().catch(() => {});
        localPlayer.disconnect();
      }
      if (playerRef.current === localPlayer) {
        playerRef.current = null;
      }
      deviceIdRef.current = null;
    };
  }, [enabled, authStatus]);

  // 3. Interpolate playback progress and enforce A-B rehearsal loop
  useEffect(() => {
    if (!enabled || isPaused || !isCurrentTrackActive) return;

    const timer = setInterval(() => {
      const total = durationRef.current;
      const elapsed = performance.now() - anchorTimeRef.current;
      const nextPos = total > 0 ? Math.min(total, anchorPosRef.current + elapsed) : anchorPosRef.current + elapsed;

      if (!scrubbingRef.current) {
        setPositionMs(nextPos);
      }

      const a = loopARef.current;
      const b = loopBRef.current;
      const now = performance.now();
      if (a !== null && b !== null && nextPos >= b && now - lastLoopSeekAtRef.current > 450) {
        lastLoopSeekAtRef.current = now;
        anchorPosRef.current = a;
        anchorTimeRef.current = now;
        if (!scrubbingRef.current) {
          setPositionMs(a);
        }
        void playerRef.current?.seek(a).catch(() => {});
      }
    }, 250);

    return () => clearInterval(timer);
  }, [enabled, isPaused, isCurrentTrackActive]);

  const playTrackOnDevice = useCallback(
    async (targetTrackId: string, startPositionMs = 0) => {
      const devId = deviceIdRef.current;
      if (!devId) {
        setError('Player do Spotify ainda está conectando. Tente em instantes.');
        return;
      }

      setIsStarting(true);
      setError(null);

      try {
        const sendPlay = async (token: string) =>
          fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(devId)}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              uris: [`spotify:track:${targetTrackId}`],
              position_ms: Math.max(0, Math.round(startPositionMs)),
            }),
          });

        let token = await fetchFreshToken(false);
        if (!token) {
          setError('Conecte sua conta Spotify para tocar a faixa.');
          return;
        }

        let res = await sendPlay(token);

        if (res.status === 404) {
          await new Promise((r) => setTimeout(r, 500));
          res = await sendPlay(token);
        }

        if (res.status === 401) {
          token = await fetchFreshToken(true);
          if (token) {
            res = await sendPlay(token);
          }
        }

        if (res.status === 403) {
          setRequiresPremium(true);
          setError('O Spotify recusou a reprodução (conta Premium necessária).');
          return;
        }

        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          setError(payload?.error?.message || 'Não foi possível iniciar a reprodução no Spotify.');
          return;
        }

        anchorPosRef.current = startPositionMs;
        anchorTimeRef.current = performance.now();
        setPositionMs(startPositionMs);
        setIsCurrentTrackActive(true);
        setIsPaused(false);
      } catch {
        setError('Erro de conexão ao iniciar a música no Spotify.');
      } finally {
        setIsStarting(false);
      }
    },
    [fetchFreshToken]
  );

  const login = useCallback(() => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/api/spotify/auth?returnTo=${encodeURIComponent(returnTo)}`);
  }, []);

  const logout = useCallback(async () => {
    await playerRef.current?.pause().catch(() => {});
    playerRef.current?.disconnect();
    playerRef.current = null;
    tokenCacheRef.current = null;
    deviceIdRef.current = null;
    setDeviceId(null);
    setSdkReady(false);
    setIsPaused(true);
    setIsCurrentTrackActive(false);
    setActiveTrack(null);
    setPositionMs(0);
    setDurationMs(0);
    setLoopA(null);
    setLoopB(null);
    setUser(null);
    setRequiresPremium(false);
    setError(null);
    setAuthStatus('unauthenticated');
    await fetch('/api/spotify/logout', { method: 'POST' }).catch(() => {});
  }, []);

  const togglePlay = useCallback(async () => {
    void playerRef.current?.activateElement?.().catch(() => {});
    if (isCurrentTrackActive && playerRef.current) {
      try {
        await playerRef.current.togglePlay();
        return;
      } catch {
        // Fall back to explicit Web API play command
      }
    }
    await playTrackOnDevice(trackIdRef.current, 0);
  }, [isCurrentTrackActive, playTrackOnDevice]);

  const seek = useCallback(
    async (ms: number) => {
      const total = durationRef.current;
      const clamped = total > 0 ? Math.max(0, Math.min(total, Math.round(ms))) : Math.max(0, Math.round(ms));
      anchorPosRef.current = clamped;
      anchorTimeRef.current = performance.now();
      setPositionMs(clamped);

      if (isCurrentTrackActive && playerRef.current) {
        await playerRef.current.seek(clamped).catch(() => {});
      } else if (sdkReady) {
        await playTrackOnDevice(trackIdRef.current, clamped);
      }
    },
    [isCurrentTrackActive, sdkReady, playTrackOnDevice]
  );

  const skipBy = useCallback(
    async (deltaMs: number) => {
      await seek(positionRef.current + deltaMs);
    },
    [seek]
  );

  const setVolumeLevel = useCallback(async (nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, nextVolume));
    if (clamped > 0) {
      lastNonZeroVolumeRef.current = clamped;
    }
    setVolume(clamped);
    setMuted(clamped === 0);
    await playerRef.current?.setVolume(clamped).catch(() => {});
  }, []);

  const toggleMute = useCallback(async () => {
    if (muted || volume === 0) {
      const restore = lastNonZeroVolumeRef.current > 0 ? lastNonZeroVolumeRef.current : 0.8;
      await setVolumeLevel(restore);
    } else {
      lastNonZeroVolumeRef.current = volume;
      setMuted(true);
      await playerRef.current?.setVolume(0).catch(() => {});
    }
  }, [muted, volume, setVolumeLevel]);

  const cycleLoop = useCallback(() => {
    const pos = Math.round(positionRef.current);
    if (loopARef.current === null) {
      setLoopA(pos);
      return;
    }
    if (loopBRef.current === null) {
      if (pos > loopARef.current + 1500) {
        const a = loopARef.current;
        setLoopB(pos);
        void seek(a);
      } else {
        setLoopA(pos);
      }
      return;
    }
    setLoopA(null);
    setLoopB(null);
  }, [seek]);

  const clearLoop = useCallback(() => {
    setLoopA(null);
    setLoopB(null);
  }, []);

  const setScrubbing = useCallback((active: boolean) => {
    scrubbingRef.current = active;
  }, []);

  const previewPosition = useCallback((ms: number) => {
    setPositionMs(ms);
  }, []);

  return {
    authStatus,
    user,
    sdkReady,
    deviceId,
    isPaused,
    isStarting,
    isCurrentTrackActive,
    activeTrack,
    positionMs,
    durationMs,
    volume,
    muted,
    loopA,
    loopB,
    error,
    requiresPremium,
    login,
    logout,
    togglePlay,
    seek,
    skipBy,
    setVolumeLevel,
    toggleMute,
    cycleLoop,
    clearLoop,
    setScrubbing,
    previewPosition,
  };
}
