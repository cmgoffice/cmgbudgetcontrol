import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function mergeColumnWeights(
  defaultWeights: Record<string, number>,
  savedWidths?: Record<string, number> | null
): Record<string, number> {
  const out: Record<string, number> = { ...defaultWeights };
  if (!savedWidths) return out;
  for (const k of Object.keys(defaultWeights)) {
    const v = savedWidths[k];
    if (typeof v === "number" && v > 0) out[k] = v;
  }
  return out;
}

export function scaleWeightsToContainer(
  weights: Record<string, number>,
  containerWidth: number,
  driftKey: string
): Record<string, number> {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const avail = containerWidth > 0 ? containerWidth : total;
  const scale = total > 0 ? avail / total : 1;
  const scaled: Record<string, number> = {};
  for (const key of Object.keys(weights)) {
    scaled[key] = Math.round(weights[key] * scale);
  }
  const sumScaled = Object.values(scaled).reduce((a, b) => a + b, 0);
  if (avail > 0 && driftKey in scaled) scaled[driftKey] += avail - sumScaled;
  return scaled;
}

type UseProportionalTableLayoutArgs = {
  tableId: string;
  defaultWeights: Record<string, number>;
  savedWidths?: Record<string, number>;
  containerRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
  driftKey: string;
  handleColumnResize: (tableId: string, colKey: string, width: number) => void;
  /** Keep each column width independent instead of fitting all columns to the container. */
  fitToContainer?: boolean;
};

export function useProportionalTableLayout({
  tableId,
  defaultWeights,
  savedWidths,
  containerRef,
  enabled,
  driftKey,
  handleColumnResize,
  fitToContainer = true,
}: UseProportionalTableLayoutArgs) {
  const [containerWidth, setContainerWidth] = useState(0);
  const pendingWidthRef = useRef<number | null>(null);
  const committedWidthRef = useRef<number | null>(null);
  const resizeCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let ro: ResizeObserver | undefined;
    let cancelled = false;
    const commitWidth = (width: number) => {
      if (cancelled || width <= 0 || committedWidthRef.current === width) return;
      committedWidthRef.current = width;
      setContainerWidth(width);
    };
    const scheduleWidthCommit = (width: number, delay = 120) => {
      if (width <= 0 || committedWidthRef.current === width) return;
      pendingWidthRef.current = width;
      if (resizeCommitTimerRef.current) clearTimeout(resizeCommitTimerRef.current);
      resizeCommitTimerRef.current = setTimeout(() => {
        resizeCommitTimerRef.current = null;
        const pendingWidth = pendingWidthRef.current;
        pendingWidthRef.current = null;
        if (pendingWidth != null) commitWidth(pendingWidth);
      }, delay);
    };
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      const el = containerRef.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      ro = new ResizeObserver((entries) => {
        const w = Math.floor(entries[0]?.contentRect?.width ?? 0);
        // Sidebar collapse animates the table width for a few frames. Delay the
        // commit until the width is stable so each animation does not trigger a
        // full table recalculation.
        scheduleWidthCommit(w);
      });
      ro.observe(el);
      commitWidth(Math.floor(el.getBoundingClientRect().width));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (resizeCommitTimerRef.current) clearTimeout(resizeCommitTimerRef.current);
      resizeCommitTimerRef.current = null;
      pendingWidthRef.current = null;
      ro?.disconnect();
    };
  }, [enabled, containerRef]);

  const scaled = useMemo(() => {
    const weights = mergeColumnWeights(defaultWeights, savedWidths);
    return fitToContainer
      ? scaleWeightsToContainer(weights, containerWidth, driftKey)
      : weights;
  }, [defaultWeights, savedWidths, containerWidth, driftKey, fitToContainer]);

  const handleResize = useCallback(
    (tid: string, colKey: string, widthPx: number) => {
      if (tid !== tableId) return;
      const el = containerRef.current;
      let W = Math.floor(el?.getBoundingClientRect?.().width ?? 0);
      if (W <= 0) W = containerWidth;
      const weights = mergeColumnWeights(defaultWeights, savedWidths);

      if (!fitToContainer) {
        handleColumnResize(tableId, colKey, Math.max(30, Math.round(widthPx)));
        return;
      }

      const T = Object.values(weights).reduce((a, b) => a + b, 0);
      if (W <= 0) W = T;
      const newWeight = Math.max(30, Math.round((widthPx * T) / W));
      handleColumnResize(tableId, colKey, newWeight);
    },
    [tableId, defaultWeights, savedWidths, containerWidth, containerRef, handleColumnResize, fitToContainer]
  );

  return { scaled, handleResize };
}

/** เรียกหลาย handleResize ต่อครั้ง (แต่ละตัวทำงานเฉพาะ tableId ของตัวเอง) */
export function chainTableResizeHandlers(
  ...handlers: Array<(tid: string, colKey: string, w: number) => void>
) {
  return (tid: string, colKey: string, w: number) => {
    handlers.forEach((h) => h(tid, colKey, w));
  };
}
