'use client';

import { useEffect, useRef, useState } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
}

/**
 * Keeps the device screen awake while reading lyrics/chords on stage or during
 * rehearsal (Show Mode, Focus Mode, Auto-scroll, or Metronome). Automatically
 * re-acquires the lock when returning to a visible tab.
 */
export function useWakeLock(enabled: boolean): { active: boolean } {
  const [active, setActive] = useState(false);
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (sentinelRef.current) {
        const current = sentinelRef.current;
        sentinelRef.current = null;
        current.release().catch(() => {});
      }
      return;
    }

    const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithWakeLock) : null;
    if (!nav?.wakeLock) return;

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const sentinel = await nav.wakeLock!.request('screen');
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        setActive(true);
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
            setActive(false);
          }
        });
      } catch {
        setActive(false);
      }
    };

    acquire();

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinelRef.current) {
        acquire();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinelRef.current) {
        const current = sentinelRef.current;
        sentinelRef.current = null;
        current.release().catch(() => {});
      }
      setActive(false);
    };
  }, [enabled]);

  return { active: enabled && active };
}
