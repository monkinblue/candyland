import { useCallback, useEffect, useState } from 'react';

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export interface UseFullscreenResult {
  isSupported: boolean;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
}

function getIsFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FullscreenDocument;
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

function getIsSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FullscreenDocument;
  const el = document.documentElement as FullscreenElement | null;
  if (!el) return false;
  const canRequest =
    typeof el.requestFullscreen === 'function' ||
    typeof el.webkitRequestFullscreen === 'function';
  const enabledFlag =
    doc.fullscreenEnabled !== false && doc.webkitFullscreenEnabled !== false;
  return canRequest && enabledFlag;
}

/**
 * Cross-browser Fullscreen API hook with WebKit prefix fallbacks for
 * Pixel Tablet, Google TV (TV Bro), and desktop browsers.
 */
export function useFullscreen(): UseFullscreenResult {
  const [isSupported] = useState<boolean>(() => getIsSupported());
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    getIsFullscreen()
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleChange = () => {
      setIsFullscreen(getIsFullscreen());
    };

    document.addEventListener('fullscreenchange', handleChange);
    document.addEventListener('webkitfullscreenchange', handleChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      document.removeEventListener('webkitfullscreenchange', handleChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    const doc = document as FullscreenDocument;
    const el = document.documentElement as FullscreenElement | null;

    try {
      if (getIsFullscreen()) {
        const exitPromise =
          typeof doc.exitFullscreen === 'function'
            ? doc.exitFullscreen()
            : typeof doc.webkitExitFullscreen === 'function'
              ? doc.webkitExitFullscreen()
              : undefined;
        if (exitPromise && typeof (exitPromise as Promise<void>).catch === 'function') {
          (exitPromise as Promise<void>).catch(() => {
            // Ignore transient exit rejection
          });
        }
      } else if (el) {
        const reqPromise =
          typeof el.requestFullscreen === 'function'
            ? el.requestFullscreen()
            : typeof el.webkitRequestFullscreen === 'function'
              ? el.webkitRequestFullscreen()
              : undefined;
        if (reqPromise && typeof (reqPromise as Promise<void>).catch === 'function') {
          (reqPromise as Promise<void>).catch(() => {
            // Ignore autoplay/gesture rejection
          });
        }
      }
    } catch {
      // Ignore unsupported environment errors
    }
  }, []);

  return {
    isSupported,
    isFullscreen,
    toggleFullscreen,
  };
}
