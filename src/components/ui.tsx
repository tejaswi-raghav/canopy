"use client";
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Metric } from "@/lib/types";

export function AnimatedNumber({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (reduce) {
      setShown(value);
      prev.current = value;
      return;
    }
    const c = animate(prev.current, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(v) });
    prev.current = value;
    return () => c.stop();
  }, [value, reduce]);
  return <span className={className}>{shown.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>;
}

export function fmtMetric(m: Metric): string {
  if (m.value === null) return "—";
  const v = m.value;
  const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 1;
  return v.toLocaleString("en-IN", { maximumFractionDigits: d });
}

export function ProvenanceNote({ m }: { m: Metric }) {
  const p = m.provenance;
  return (
    <details className="group text-xs text-charcoal/70">
      <summary className="cursor-pointer select-none underline decoration-dotted underline-offset-2">How this is calculated</summary>
      <dl className="mt-1 space-y-0.5 pl-0.5">
        <div><dt className="inline font-semibold">Source: </dt><dd className="inline">{p.source}</dd></div>
        <div><dt className="inline font-semibold">Observed: </dt><dd className="inline">{p.observedAt ?? "unknown"}</dd></div>
        <div><dt className="inline font-semibold">Method: </dt><dd className="inline">{p.method}</dd></div>
        <div><dt className="inline font-semibold">Confidence: </dt><dd className="inline">{p.confidence === "n/a" ? (p.demo ? "demonstration only" : "not available") : p.confidence}</dd></div>
        {m.note && <div className="text-charcoal"><dt className="sr-only">Note</dt><dd>{m.note}</dd></div>}
      </dl>
    </details>
  );
}

export function EditorialStat({ m, decimals, lead }: { m: Metric; decimals?: number; lead?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        {m.value === null ? (
          <span className={`numeral ${lead ? "text-5xl" : "text-3xl"} text-charcoal/55`}>—</span>
        ) : (
          <AnimatedNumber value={m.value} decimals={decimals ?? (Math.abs(m.value) >= 100 ? 0 : 1)} className={`numeral font-extrabold text-forest ${lead ? "text-5xl" : "text-3xl"}`} />
        )}
        {m.value !== null && <span className="text-sm text-charcoal/70">{m.unit}</span>}
      </div>
      <div className="mt-1 text-sm leading-snug text-charcoal">{m.label}</div>
      {m.value === null && m.note && <p className="mt-1 text-xs text-charcoal/65">{m.note}</p>}
      <ProvenanceNote m={m} />
    </div>
  );
}

export function DemoBadge({ demo }: { demo: boolean }) {
  return demo ? (
    <span className="inline-block rounded-sm bg-botanical/30 px-2 py-0.5 text-xs font-semibold text-forest">Demonstration data</span>
  ) : (
    <span className="inline-block rounded-sm bg-forest px-2 py-0.5 text-xs font-semibold text-ivory">Live · OpenStreetMap</span>
  );
}

export function Meter({ value, label, valueLabel }: { value: number | null; label: string; valueLabel?: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{value === null ? "—" : valueLabel ?? `${Math.round(value)}%`}</span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-forest/10" role="img" aria-label={`${label}: ${value === null ? "not available" : Math.round(value) + " percent"}`}>
        {value !== null && <div className="h-full bg-forest" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />}
      </div>
    </div>
  );
}
