'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { DEFAULT_LIVE_SESSION, type LiveSession } from '@/lib/types/live-session';

const POLL_MS = 1500;
const LEADER_STALE_MS = 20000;

function loadDeviceId(): string {
  let id = localStorage.getItem('jamshelf-device-id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('jamshelf-device-id', id);
  }
  return id;
}

async function putSession(setlistId: string, updates: Partial<LiveSession>) {
  try {
    await fetch(`/api/sessions/${setlistId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  } catch (err) {
    console.error('Failed to sync live session:', err);
  }
}

/**
 * Read-only session status (who's leading, if anyone) with no push/claim
 * logic. Safe to mount anywhere just to display status — e.g. the setlist
 * list page — without risking two live tabs fighting over leadership state.
 * Use `useLiveSession` instead on the actual song-playing page.
 */
export function useLiveSessionStatus(setlistId: string | null) {
  const [session, setSession] = useState<LiveSession>(DEFAULT_LIVE_SESSION);

  useEffect(() => {
    if (!setlistId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(`/api/sessions/${setlistId}`);
        if (!res.ok || cancelled) return;
        setSession(await res.json());
      } catch {
        // ignore — keep showing last known status
      }
    };

    tick();
    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setlistId]);

  return session;
}

/**
 * Keeps auto-scroll, current song, and metronome in sync across every device
 * viewing the same setlist. One device leads (ground truth); everyone else
 * polls and mirrors. See docs/ARCHITECTURE.md for the full design.
 */
export function useLiveSession(
  setlistId: string | null,
  currentSongId: string,
  scrollTopRef: { current: number }
) {
  const deviceIdRef = useRef('');
  const deviceNameRef = useRef('');
  const [deviceName, setDeviceNameState] = useState('');
  const [session, setSession] = useState<LiveSession>(DEFAULT_LIVE_SESSION);
  const [isLeading, setIsLeading] = useState(false);
  const [syncNonce, setSyncNonce] = useState(0);

  useEffect(() => {
    deviceIdRef.current = loadDeviceId();
    const storedName = localStorage.getItem('jamshelf-device-name') || '';
    deviceNameRef.current = storedName;
    setDeviceNameState(storedName);
  }, []);

  const setDeviceName = useCallback((name: string) => {
    deviceNameRef.current = name;
    localStorage.setItem('jamshelf-device-name', name);
    setDeviceNameState(name);
  }, []);

  const currentSongIdRef = useRef(currentSongId);
  const isLeadingRef = useRef(false);
  useEffect(() => {
    isLeadingRef.current = isLeading;
  }, [isLeading]);
  useEffect(() => {
    currentSongIdRef.current = currentSongId;
    // Leader's song change should reach followers as fast as possible —
    // don't wait for the next poll tick, push it the moment it happens.
    if (setlistId && isLeadingRef.current) {
      putSession(setlistId, { currentSongId, updatedAt: Date.now() });
    }
  }, [currentSongId, setlistId]);

  useEffect(() => {
    if (!setlistId) return;
    let cancelled = false;

    const tick = async () => {
      let fetched: LiveSession;
      try {
        const res = await fetch(`/api/sessions/${setlistId}`);
        if (!res.ok) return;
        fetched = await res.json();
      } catch {
        return;
      }
      if (cancelled) return;

      const myId = deviceIdRef.current;
      const leading = !!myId && fetched.leaderId === myId;
      setSession(fetched);
      setIsLeading(leading);

      const player = usePlayerStore.getState();

      if (leading) {
        // I'm the leader: report my own ground-truth state.
        putSession(setlistId, {
          currentSongId: currentSongIdRef.current,
          isAutoScrolling: player.isAutoScrolling,
          autoScrollSpeed: player.autoScrollSpeed,
          scrollTop: scrollTopRef.current,
          metronomeOn: player.metronomeOn,
          bpm: player.bpm,
          updatedAt: Date.now(),
        });
      } else if (fetched.leaderId) {
        // Someone else is leading: mirror their state (only on real changes,
        // to avoid needless re-renders of every player-store consumer).
        if (player.isAutoScrolling !== fetched.isAutoScrolling) {
          player.setAutoScrolling(fetched.isAutoScrolling);
        }
        if (player.autoScrollSpeed !== fetched.autoScrollSpeed) {
          player.setAutoScrollSpeed(fetched.autoScrollSpeed);
        }
        if (player.metronomeOn !== fetched.metronomeOn) {
          player.setMetronomeOn(fetched.metronomeOn);
        }
        if (player.bpm !== fetched.bpm) {
          player.setBpm(fetched.bpm);
        }
        setSyncNonce((n) => n + 1);
      }
    };

    tick();
    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // scrollTopRef is a stable ref object; currentSongId is tracked via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setlistId]);

  const startLeading = useCallback(
    (name?: string) => {
      if (!setlistId) return;
      const finalName = name?.trim() || deviceNameRef.current || 'Someone';
      if (name) setDeviceName(finalName);

      const player = usePlayerStore.getState();
      const payload: Partial<LiveSession> = {
        leaderId: deviceIdRef.current,
        leaderName: finalName,
        currentSongId: currentSongIdRef.current,
        isAutoScrolling: player.isAutoScrolling,
        autoScrollSpeed: player.autoScrollSpeed,
        scrollTop: scrollTopRef.current,
        metronomeOn: player.metronomeOn,
        bpm: player.bpm,
        updatedAt: Date.now(),
      };
      setIsLeading(true);
      setSession((s) => ({ ...s, ...payload } as LiveSession));
      putSession(setlistId, payload);
    },
    [setlistId, scrollTopRef, setDeviceName]
  );

  const stopLeading = useCallback(() => {
    if (!setlistId) return;
    setIsLeading(false);
    setSession((s) => ({ ...s, leaderId: null, leaderName: null }));
    putSession(setlistId, { leaderId: null, leaderName: null });
  }, [setlistId]);

  const endSession = useCallback(() => {
    if (!setlistId) return;
    setIsLeading(false);
    setSession(DEFAULT_LIVE_SESSION);
    fetch(`/api/sessions/${setlistId}`, { method: 'DELETE' }).catch((err) =>
      console.error('Failed to end live session:', err)
    );
  }, [setlistId]);

  const deviceId = deviceIdRef.current;
  const isFollowing = !isLeading && !!session.leaderId && session.leaderId !== deviceId;
  const isLeaderStale = isFollowing && Date.now() - session.updatedAt > LEADER_STALE_MS;

  const syncCorrection = useMemo(
    () => (isFollowing ? { scrollTop: session.scrollTop, nonce: syncNonce } : undefined),
    [isFollowing, session.scrollTop, syncNonce]
  );

  return {
    session,
    deviceId,
    deviceName,
    setDeviceName,
    isLeading,
    isFollowing,
    isLeaderStale,
    startLeading,
    stopLeading,
    endSession,
    syncCorrection,
  };
}
