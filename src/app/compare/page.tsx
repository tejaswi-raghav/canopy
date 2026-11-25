"use client";
import { useMemo, useState } from "react";
import GreenPlot from "@/components/GreenPlot";
import MiniMap from "@/components/MiniMap";
import { DemoBadge } from "@/components/ui";
import { DEMO_SEEDS, demoDataset } from "@/data/demo";
import { computeAreaMetrics, isPublicPark } from "@/lib/metrics";
import { computeQuality } from "@/lib/scoring";
import { useArea } from "@/lib/store";
import type { AreaDataset } from "@/lib/types";

const RECREATION = ["walking_track", "running_track", "cycling_path", "outdoor_gym", "swings", "slides", "playground", "basketball", "badminton", "football", "yoga"] as const;

function summarise(ds: AreaDataset) {
  const m = computeAreaMetrics(ds);
  const pub = ds.parks.filter(isPublicPark);
  const q = pub.map((p) => computeQuality(p)).filter((x) => x.status === "scored");
  const fac = pub.length ? pub.reduce((a, p) => a + RECREATION.filter((k) => p.amenities[k] === "available").length, 0) / pub.length : null;
  return { ds, m, avgQ: q.length ? q.reduce((a, x) => a + x.overall!, 0) / q.length : null, nQ: q.length, fac };
}

const f = (v: number | null | undefined, d = 1, unit = "") => (v === null || v === undefined ? "—" : `${v.toLocaleString("en-IN", { maximumFractionDigits: d })}${unit}`);

export default function ComparePage() {
  const { dataset } = useArea();
  const options = useMemo(() => {
    const o: { id: string; label: string; ds: () => AreaDataset }[] = DEMO_SEEDS.map((s) => ({ id: s.id, label: `${s.name} (demo)`, ds: () => demoDataset(s.id)! }));
    o.unshift({ id: "hyderabad", label: "Hyderabad, 8 localities (demo)", ds: () => demoDataset("hyderabad")! });
    if (dataset?.mode === "live") o.push({ id: "current", label: `${dataset.label} (live)`, ds: () => dataset });
    return o;
  }, [dataset]);
  const [picked, setPicked] = useState<string[]>(["jubilee-hills", "old-city"]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));
  const cols = useMemo(() => picked.map((id) => options.find((o) => o.id === id)).filter(Boolean).map((o) => summarise(o!.ds())), [picked, options]);

  const modes = new Set(cols.map((c) => c.ds.mode));
  const periods = new Set(cols.map((c) => c.ds.boundaryProvenance.observedAt));
  const approx = cols.some((c) => c.ds.boundaryProvenance.confidence === "low" || c.ds.mode === "demo");
  const noPop = cols.some((c) => !c.ds.population);

  const rows: { label: string; cell: (c: ReturnType<typeof summarise>) => React.ReactNode }[] = [
    { label: "Public park per resident", cell: (c) => <GreenPlot m2={c.m.byKey.public_park_per_resident.value} /> },
    { label: "Mapped public parks", cell: (c) => f(c.m.byKey.parks_count.value, 0) },
    { label: "Public park area", cell: (c) => f(c.m.byKey.public_park_area.value, 1, " ha") },
    { label: "Parks per 10,000 residents", cell: (c) => f(c.m.byKey.parks_per_10k.value, 1) },
    { label: "Population density", cell: (c) => f(c.m.byKey.density.value, 0, " /km²") },
    { label: "Within a 15-minute walk of a park", cell: (c) => f(c.m.walk[15], 0, "%") },
    { label: "Average park quality (provisional)", cell: (c) => (c.avgQ === null ? "—" : `${Math.round(c.avgQ)}/100 (${c.nQ} parks)`) },
    { label: "Vegetation cover", cell: (c) => f(c.m.byKey.vegetation_pct.value, 1, "%") },
    { label: "Confirmed recreation facilities per park", cell: (c) => f(c.fac, 1) },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold text-forest">Compare neighbourhoods</h1>
      <fieldset className="mt-5">
        <legend className="text-sm text-charcoal/75">Choose up to three areas</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {options.map((o) => {
            const on = picked.includes(o.id);
            return <button key={o.id} aria-pressed={on} onClick={() => toggle(o.id)} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-forest bg-forest text-ivory" : "border-forest/30 text-forest"}`}>{o.label}</button>;
          })}
        </div>
      </fieldset>

      {cols.length >= 2 && (
        <div className="mt-6 space-y-1 text-sm text-charcoal/80" role="note">
          {modes.size > 1 && <p className="text-[#7E2A1C]">These areas mix demonstration and live data, so differences may reflect data sources rather than the places. Compare like with like.</p>}
          {periods.size > 1 && <p>Data observed on different dates: {[...periods].join(", ")}.</p>}
          {approx && <p>Boundaries here are illustrative or radius-based; official ward polygons would change the figures.</p>}
          {noPop && <p>Some areas have no population estimate, so per-resident rows show “—” for them.</p>}
        </div>
      )}

      {cols.length === 0 ? <p className="mt-10">Select at least one area.</p> : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="align-bottom">
                <th scope="col" className="w-48 pb-3"><span className="sr-only">Measure</span></th>
                {cols.map((c) => (
                  <th key={c.ds.slug} scope="col" className="pb-3 pr-4 font-normal">
                    <MiniMap ds={c.ds} w={240} h={150} />
                    <div className="mt-1 font-display text-lg font-bold text-forest">{c.ds.label}</div>
                    <DemoBadge demo={c.ds.mode === "demo"} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-forest/15 align-top">
                  <th scope="row" className="py-4 pr-4 text-sm font-semibold">{r.label}</th>
                  {cols.map((c) => <td key={c.ds.slug} className="py-4 pr-4 numeral text-2xl font-bold text-forest">{r.cell(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-8 max-w-prose text-xs text-charcoal/65">The plot shows the public park area available to one resident, drawn to the same scale as a 1.7 m person. The dashed square is the 9 m² per person benchmark often attributed to WHO guidance; it is a reference, not a legal standard.</p>
    </div>
  );
}
