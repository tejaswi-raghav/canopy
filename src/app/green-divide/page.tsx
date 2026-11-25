"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import MapView, { type LayerState } from "@/components/MapView";
import { DemoBadge } from "@/components/ui";
import { computeGreenDivide, FEASIBILITY_CAVEAT, suggestInterventions } from "@/lib/greenDivide";
import { useArea } from "@/lib/store";
import { DEMO_SEEDS } from "@/data/demo";

const LAYERS: LayerState = { parks: true, vegetation: false, quality: false, population: false, walk: false, boundaries: true, divide: true, satellite: false, buildings3d: false };

export default function GreenDivide() {
  const { dataset, qualities, select } = useArea();
  const [benchmark, setBenchmark] = useState(9);
  const cells = dataset?.population?.cells ?? null;
  const res = useMemo(() => (dataset && cells ? computeGreenDivide(cells, dataset.parks, { benchmark }) : null), [dataset, cells, benchmark]);
  const suggestions = useMemo(() => (res && dataset ? suggestInterventions(res, dataset.parks, 8) : []), [res, dataset]);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col md:flex-row">
      <div className="relative min-h-[40dvh] flex-1 md:order-2">
        {dataset && <MapView className="absolute inset-0" dataset={dataset} qualities={qualities} layers={LAYERS} selectedId={null} onSelect={() => {}} divide={res?.cells ?? null} />}
        <div className="absolute bottom-6 left-3 bg-ivory/90 px-3 py-2 text-xs" aria-label="Legend">
          <div className="font-semibold">Unmet need (0–100)</div>
          <div className="mt-1 h-2 w-40" style={{ background: "linear-gradient(90deg,#DDE5D3,#E3C27A,#C46B3A,#7E2A1C)" }} />
          <div className="flex w-40 justify-between"><span>low</span><span>high</span></div>
        </div>
      </div>
      <aside className="max-h-[60dvh] w-full overflow-y-auto border-t border-forest/15 bg-ivory md:order-1 md:max-h-none md:w-[440px] md:border-r md:border-t-0">
        <div className="space-y-6 p-4 sm:p-5">
          <header>
            <h1 className="font-display text-3xl font-extrabold text-forest">Green Divide</h1>
            <p className="mt-2 text-sm text-charcoal/80">Dense neighbourhoods with little park within reach. {dataset && <><span className="font-semibold">{dataset.label}</span> <DemoBadge demo={dataset.mode === "demo"} /></>}</p>
          </header>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Choose a demonstration area">
            {["hyderabad", ...DEMO_SEEDS.map((x) => x.id)].map((slug) => (
              <button key={slug} aria-pressed={dataset?.slug === slug} onClick={() => void select({ kind: "demo", slug })} className={`rounded-full border px-3 py-1 text-sm ${dataset?.slug === slug ? "border-forest bg-forest text-ivory" : "border-forest/30 text-forest"}`}>
                {slug === "hyderabad" ? "All of Hyderabad (demo)" : DEMO_SEEDS.find((x) => x.id === slug)!.name}
              </button>
            ))}
          </div>
          {!cells && dataset && (
            <div className="border-l-2 border-[#7E2A1C] pl-3 text-sm">
              <p className="font-semibold">Needs a gridded population layer</p>
              <p className="mt-1">This area has parks from OpenStreetMap but no population grid. Run the backend pipeline (GHSL or WorldPop) to produce <code>public/data/population/&lt;area&gt;.json</code>, or pick the Hyderabad demonstration on <Link href="/explore/" className="underline">Explore</Link>.</p>
            </div>
          )}
          {res && (
            <>
              <div>
                <div className="numeral text-5xl font-extrabold text-[#7E2A1C]">{res.totalPopulation ? Math.round((res.flaggedPopulation / res.totalPopulation) * 100) : 0}%</div>
                <p className="mt-1 text-sm">of residents live in grid cells flagged as under-served ({res.cells.filter((c) => c.flagged).length} of {res.cells.length} cells of 250 m).</p>
              </div>
              <label className="block text-sm">Green space benchmark: <strong>{benchmark} m² per resident</strong>
                <input type="range" min={4} max={20} step={1} value={benchmark} onChange={(e) => setBenchmark(Number(e.target.value))} className="mt-1 w-full" />
                <span className="text-xs text-charcoal/65">9 m² is widely quoted from WHO guidance. Change it to see how sensitive the result is.</span>
              </label>
              <section aria-label="Suggested actions">
                <h2 className="font-display text-xl font-bold">Where to look first</h2>
                <ol className="mt-2 divide-y divide-forest/10">
                  {suggestions.map((s, i) => (
                    <li key={s.cellId + s.kind} className="py-3 text-sm">
                      <div className="font-semibold">{i + 1}. {s.title}</div>
                      <div className="text-xs text-charcoal/65">{s.center[1].toFixed(4)}, {s.center[0].toFixed(4)} · about {s.population.toLocaleString("en-IN")} residents in the cell</div>
                      <p className="mt-1 text-charcoal/85">{s.detail}</p>
                    </li>
                  ))}
                  {suggestions.length === 0 && <li className="py-3 text-sm">No under-served dense areas found at this benchmark.</li>}
                </ol>
                <p className="mt-2 text-xs text-charcoal/70">{FEASIBILITY_CAVEAT} Tree-planting and shade priorities need a canopy layer, which is not loaded here.</p>
              </section>
              <section className="text-xs text-charcoal/70" aria-label="Method">
                <h2 className="text-sm font-semibold text-charcoal">How the index works</h2>
                <p className="mt-1">Per 250 m cell: park area per resident using a two-step floating catchment (1 km), distance to the nearest public park, population density, quality of nearby parks and confirmed facilities, weighted 35/25/20/10/10. A cell is flagged at 60 or more and above median density. Distances are straight-line.</p>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
