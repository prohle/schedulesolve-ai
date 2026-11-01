"use client";

// Thin client wrapper around ECharts. The runtime is imported lazily so the
// landing page still server-renders without touching `window`, and the chart
// re-sizes with its container (canvas grid + modal both change width).

import { useEffect, useRef, useState } from "react";
import type { ECharts, EChartsOption } from "echarts";

export function EChart({
  option,
  className = "h-40 w-full",
  label,
}: {
  option: EChartsOption;
  className?: string;
  label: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  // The first option only seeds the initial render; later options stream in
  // through the update effect below. (Reading a ref during render is not
  // allowed, so the seed is captured in state.)
  const [initialOption] = useState(option);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let chart: ECharts | null = null;
    let observer: ResizeObserver | null = null;

    import("echarts")
      .then((echarts) => {
        if (cancelled) return;
        chart = echarts.init(host, undefined, { renderer: "canvas" });
        chart.setOption(initialOption);
        chartRef.current = chart;
        observer = new ResizeObserver(() => chart?.resize());
        observer.observe(host);
      })
      .catch(() => {
        // Charts are decorative: a failed load must never break the page.
      });

    return () => {
      cancelled = true;
      observer?.disconnect();
      chart?.dispose();
      chartRef.current = null;
    };
  }, [initialOption]);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={hostRef} className={className} role="img" aria-label={label} />;
}
