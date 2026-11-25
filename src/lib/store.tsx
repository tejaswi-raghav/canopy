"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { demoDataset } from "@/data/demo";
import type { GeocodeHit } from "./adapters/geocode";
import { liveDataset } from "./dataset";
import { computeAreaMetrics, type AreaMetrics } from "./metrics";
import { computeQuality, type QualityResult } from "./scoring";
import type { AreaDataset } from "./types";

export type Selection = { kind: "demo"; slug: string } | { kind: "live"; hit: GeocodeHit; radiusKm: number };

interface Ctx {
  dataset: AreaDataset | null;
  metrics: AreaMetrics | null;
  qualities: Record<string, QualityResult>;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  select: (s: Selection) => Promise<void>;
}

const AreaCtx = createContext<Ctx | null>(null);
const KEY = "canopy.selection";
const liveCache = new Map<string, AreaDataset>();

export function AreaProvider({ children }: { children: React.ReactNode }) {
  const [dataset, setDataset] = useState<AreaDataset | null>(null);
  const [status, setStatus] = useState<Ctx["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const select = useCallback(async (s: Selection) => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setStatus("loading");
    setError(null);
    try {
      let ds: AreaDataset | null = null;
      if (s.kind === "demo") ds = demoDataset(s.slug);
      else {
        const k = `${s.hit.center.join(",")}|${s.radiusKm}`;
        ds = liveCache.get(k) ?? (await liveDataset(s.hit, s.radiusKm, ac.signal));
        liveCache.set(k, ds);
      }
      if (!ds) throw new Error("Unknown area.");
      if (ac.signal.aborted) return;
      setDataset(ds);
      setStatus("ready");
      try {
        sessionStorage.setItem(KEY, JSON.stringify(s));
      } catch {
        /* storage unavailable */
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      setStatus("error");
      setError(e instanceof Error ? e.message : "Something went wrong loading that area.");
    }
  }, []);

  useEffect(() => {
    let sel: Selection = { kind: "demo", slug: "hyderabad" };
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) sel = JSON.parse(raw) as Selection;
    } catch {
      /* ignore */
    }
    void select(sel);
  }, [select]);

  const metrics = useMemo(() => (dataset ? computeAreaMetrics(dataset) : null), [dataset]);
  const qualities = useMemo(() => {
    const out: Record<string, QualityResult> = {};
    dataset?.parks.forEach((p) => (out[p.id] = computeQuality(p)));
    return out;
  }, [dataset]);

  const value = useMemo(() => ({ dataset, metrics, qualities, status, error, select }), [dataset, metrics, qualities, status, error, select]);
  return <AreaCtx.Provider value={value}>{children}</AreaCtx.Provider>;
}

export function useArea() {
  const c = useContext(AreaCtx);
  if (!c) throw new Error("useArea must be used inside AreaProvider");
  return c;
}
