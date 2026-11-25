import { useCallback, useRef } from 'react';
import type React from 'react';

export interface ToddlerTapOptions {
  disabled?: boolean;
  /** Window (ms) after touch/pen pointerdown during which synthetic click is suppressed. Default: 650ms. */
  dedupeMs?: number;
}

export interface ToddlerTapProps {
  onPointerDown: React.PointerEventHandler<HTMLElement>;
  onClick: React.MouseEventHandler<HTMLElement>;
}

const DEFAULT_DEDUPE_MS = 650;

// Element-scoped dedupe map for the non-hook helper so re-renders never reset touch timestamps
const elementTouchTimestamps = new WeakMap<EventTarget, number>();

/**
 * Creates toddler-friendly tap handlers (`onPointerDown` + `onClick`).
 *
 * Toddlers (ages 3-4) often press big buttons and slide/drag their finger,
 * which cancels standard `onClick` in touch browsers. For `touch` / `pen`
 * primary pointers, this triggers IMMEDIATELY on `pointerdown` and suppresses
 * the subsequent synthetic `click` within `dedupeMs` (650ms), while mouse
 * clicks and keyboard Enter/Space continue working natively via `onClick`.
 */
export function createToddlerTapProps(
  onTrigger: () => void,
  options: ToddlerTapOptions = {}
): ToddlerTapProps {
  const { disabled = false, dedupeMs = DEFAULT_DEDUPE_MS } = options;
  let localLastTouchAt = 0;

  return {
    onPointerDown: (e) => {
      if (disabled) return;
      if ((e.pointerType === 'touch' || e.pointerType === 'pen') && e.isPrimary) {
        const now = Date.now();
        localLastTouchAt = now;
        if (e.currentTarget) {
          elementTouchTimestamps.set(e.currentTarget, now);
        }
        onTrigger();
      }
    },
    onClick: (e) => {
      if (disabled) return;
      const now = Date.now();
      const targetLast = e.currentTarget
        ? elementTouchTimestamps.get(e.currentTarget) ?? 0
        : 0;
      const lastTouch = Math.max(localLastTouchAt, targetLast);
      if (lastTouch > 0 && now - lastTouch < dedupeMs) {
        return;
      }
      onTrigger();
    },
  };
}

/**
 * React hook returning isolated `{ onPointerDown, onClick }` handlers for
 * toddler-friendly touch buttons (triggers on touch/pen `pointerdown`, dedupes
 * synthetic `click` within 650ms, preserves mouse + keyboard activation).
 */
export function useToddlerTap(
  onTrigger: () => void,
  disabled = false,
  dedupeMs = DEFAULT_DEDUPE_MS
): ToddlerTapProps {
  const triggerRef = useRef(onTrigger);
  triggerRef.current = onTrigger;

  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const lastTouchFiredAtRef = useRef<number>(0);

  const onPointerDown = useCallback<React.PointerEventHandler<HTMLElement>>((e) => {
    if (disabledRef.current) return;
    if ((e.pointerType === 'touch' || e.pointerType === 'pen') && e.isPrimary) {
      lastTouchFiredAtRef.current = Date.now();
      triggerRef.current();
    }
  }, []);

  const onClick = useCallback<React.MouseEventHandler<HTMLElement>>(
    () => {
      if (disabledRef.current) return;
      const now = Date.now();
      if (
        lastTouchFiredAtRef.current > 0 &&
        now - lastTouchFiredAtRef.current < dedupeMs
      ) {
        return;
      }
      triggerRef.current();
    },
    [dedupeMs]
  );

  return { onPointerDown, onClick };
}
