import { useCallback, useEffect, useMemo, useState } from "react";

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
};

export function useProportionalTableLayout({
  tableId,
  defaultWeights,
  savedWidths,
  containerRef,
  enabled,
  driftKey,
  handleColumnResize,
}: UseProportionalTableLayoutArgs) {
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let ro: ResizeObserver | undefined;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      const el = containerRef.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      ro = new ResizeObserver((entries) => {
        const w = Math.floor(entries[0]?.contentRect?.width ?? 0);
        setContainerWidth(w);
      });
      ro.observe(el);
      setContainerWidth(Math.floor(el.getBoundingClientRect().width));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [enabled, containerRef]);

  const scaled = useMemo(() => {
    const weights = mergeColumnWeights(defaultWeights, savedWidths);
    return scaleWeightsToContainer(weights, containerWidth, driftKey);
  }, [defaultWeights, savedWidths, containerWidth, driftKey]);

  const handleResize = useCallback(
    (tid: string, colKey: string, widthPx: number) => {
      if (tid !== tableId) return;
      const el = containerRef.current;
      let W = Math.floor(el?.getBoundingClientRect?.().width ?? 0);
      if (W <= 0) W = containerWidth;
      const weights = mergeColumnWeights(defaultWeights, savedWidths);
      const T = Object.values(weights).reduce((a, b) => a + b, 0);
      if (W <= 0) W = T;
      const newWeight = Math.max(30, Math.round((widthPx * T) / W));
      handleColumnResize(tableId, colKey, newWeight);
    },
    [tableId, defaultWeights, savedWidths, containerWidth, containerRef, handleColumnResize]
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
