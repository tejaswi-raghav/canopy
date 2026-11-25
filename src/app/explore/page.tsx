"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import AreaSearch from "@/components/AreaSearch";
import MapView, { CAN_3D, CAN_SATELLITE, type LayerState } from "@/components/MapView";
import ParkSummary from "@/components/ParkSummary";
import { DemoBadge, EditorialStat, Meter } from "@/components/ui";
import { isPublicPark } from "@/lib/metrics";
import { useArea } from "@/lib/store";

const DEFAULT_LAYERS: LayerState = { parks: true, vegetation: false, quality: false, population: false, walk: false, boundaries: true, divide: false, satellite: false, buildings3d: false };

export default function ExplorePage() {
  const { dataset, metrics, qualities, status } = useArea();
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [selected, setSelected] = useState<string | null>(null);

  const park = dataset?.parks.find((p) => p.id === selected) ?? null;
  const avgQuality = useMemo(() => {
    if (!dataset) return null;
    const s = dataset.parks.filter(isPublicPark).map((p) => qualities[p.id]).filter((q) => q?.status === "scored");
    return s.length ? { value: s.reduce((a, q) => a + q.overall!, 0) / s.length, n: s.length } : null;
  }, [dataset, qualities]);

  const set = (k: keyof LayerState, v: boolean) => setLayers((l) => ({ ...l, [k]: v }));
  const hasPop = Boolean(dataset?.population?.cells?.length);

  const sorted = useMemo(
    () => (dataset ? [...dataset.parks].sort((a, b) => (qualities[b.id]?.overall ?? -1) - (qualities[a.id]?.overall ?? -1) || b.areaM2 - a.areaM2) : []),
    [dataset, qualities],
  );

  const row = "flex items-center gap-2 py-1 text-sm";
  const by = metrics?.byKey;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col md:flex-row">
      <div className="relative min-h-[38dvh] flex-1 md:order-2">
        {dataset && <MapView className="absolute inset-0" dataset={dataset} qualities={qualities} layers={layers} selectedId={selected} onSelect={setSelected} walkCenter={park?.centroid ?? null} padding={{ top: 40, bottom: 40, left: 40, right: 40 }} />}
        {status === "loading" && <div className="absolute left-3 top-3 bg-ivory px-3 py-1.5 text-sm shadow-sm" role="status">Loading area…</div>}
        {dataset && (
          <div className="pointer-events-none absolute bottom-6 left-3 max-w-[16rem] bg-ivory/90 px-3 py-2 text-xs text-charcoal/80">
            <span className="font-semibold">Legend.</span> Green: public park. Grey-green: mapped green space, public access not confirmed. Dashed line: analysed boundary{dataset.boundaryProvenance.confidence === "low" || dataset.mode === "demo" ? " (approximate)" : ""}.
          </div>
        )}
      </div>

      <aside className="max-h-[62dvh] w-full overflow-y-auto border-t border-forest/15 bg-ivory md:order-1 md:max-h-none md:w-[420px] md:border-r md:border-t-0" aria-label="Area details">
        <div className="space-y-6 p-4 sm:p-5">
          <AreaSearch compact />

          {dataset && metrics && by && (
            <>
              <section aria-labelledby="area-title">
                <h1 id="area-title" className="font-display text-2xl font-extrabold leading-tight text-forest">{dataset.label}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2"><DemoBadge demo={dataset.mode === "demo"} /></div>
                {dataset.warnings.map((w) => <p key={w} className="mt-2 text-xs text-charcoal/75">{w}</p>)}
              </section>

              {park && <ParkSummary park={park} q={qualities[park.id]} onClose={() => { setSelected(null); set("walk", false); }} onWalk={() => set("walk", !layers.walk)} walkOn={layers.walk} />}

              <section aria-label="Key figures" className="grid grid-cols-2 gap-x-5 gap-y-6">
                <EditorialStat m={by.parks_count} decimals={0} lead />
                <EditorialStat m={by.public_park_per_resident} lead />
                <EditorialStat m={by.vegetation_pct} />
                <div>
                  <div className="flex items-baseline gap-1.5">
                    {avgQuality ? <span className="numeral text-3xl font-extrabold text-forest">{Math.round(avgQuality.value)}</span> : <span className="numeral text-3xl text-charcoal/55">—</span>}
                    {avgQuality && <span className="text-sm text-charcoal/70">/ 100</span>}
                  </div>
                  <div className="mt-1 text-sm">Average park quality</div>
                  <p className="text-xs text-charcoal/65">{avgQuality ? `Provisional, from ${avgQuality.n} parks with enough evidence. Not an official inspection.` : "No park has enough verified evidence to score."}</p>
                </div>
              </section>

              <section aria-label="Walking access" className="space-y-3">
                <h2 className="font-display text-base font-bold">Residents within walking distance of a public park</h2>
                <Meter value={metrics.walk[5]} label="5 minutes" />
                <Meter value={metrics.walk[10]} label="10 minutes" />
                <Meter value={metrics.walk[15]} label="15 minutes" />
                <p className="text-xs text-charcoal/65">{hasPop ? "Straight-line distance at 4.8 km/h, so these are approximations, not routes." : by.walk_5.note}</p>
              </section>

              <section aria-label="All measurements">
                <h2 className="font-display text-base font-bold">All measurements</h2>
                <ul className="mt-2 divide-y divide-forest/10">
                  {metrics.metrics.filter((m) => !["parks_count", "public_park_per_resident", "vegetation_pct", "walk_5", "walk_10", "walk_15"].includes(m.key)).map((m) => (
                    <li key={m.key} className="py-2"><EditorialStat m={m} /></li>
                  ))}
                </ul>
              </section>

              <fieldset>
                <legend className="font-display text-base font-bold">Map layers</legend>
                <div className="mt-1">
                  <label className={row}><input type="checkbox" checked={layers.parks} onChange={(e) => set("parks", e.target.checked)} />Park boundaries</label>
                  <label className={row}><input type="checkbox" checked={layers.vegetation} onChange={(e) => setLayers((l) => ({ ...l, vegetation: e.target.checked, quality: e.target.checked ? false : l.quality }))} />Vegetation inside parks (NDVI)</label>
                  <label className={row}><input type="checkbox" checked={layers.quality} onChange={(e) => setLayers((l) => ({ ...l, quality: e.target.checked, vegetation: e.target.checked ? false : l.vegetation }))} />Park quality score</label>
                  <label className={row}><input type="checkbox" checked={layers.boundaries} onChange={(e) => set("boundaries", e.target.checked)} />Area and neighbourhood boundaries</label>
                  <label className={`${row} ${hasPop ? "" : "opacity-50"}`}><input type="checkbox" disabled={!hasPop} checked={layers.population} onChange={(e) => set("population", e.target.checked)} />Population density{!hasPop && " (needs population grid)"}</label>
                  <label className={row}><input type="checkbox" checked={layers.walk} disabled={!park} onChange={(e) => set("walk", e.target.checked)} />Walking rings for the selected park{!park && " (select a park)"}</label>
                  <label className={`${row} ${CAN_SATELLITE ? "" : "opacity-50"}`}><input type="checkbox" disabled={!CAN_SATELLITE} checked={layers.satellite} onChange={(e) => set("satellite", e.target.checked)} />Satellite imagery{!CAN_SATELLITE && " (needs a licensed tile URL — see README)"}</label>
                  <label className={`${row} ${CAN_3D ? "" : "opacity-50"}`}><input type="checkbox" disabled={!CAN_3D} checked={layers.buildings3d} onChange={(e) => set("buildings3d", e.target.checked)} />3D buildings{!CAN_3D && " (needs a vector map style — see README)"}</label>
                </div>
                <p className="mt-2 text-xs text-charcoal/65">Area-wide vegetation rasters are processed by the backend pipeline and are not drawn in the browser. See <Link href="/methodology/" className="underline">methodology</Link>. For inequality hot spots, open <Link href="/green-divide/" className="underline">Green Divide</Link>.</p>
              </fieldset>

              <section aria-label="Parks in this area">
                <h2 className="font-display text-base font-bold">Parks ({dataset.parks.length})</h2>
                <ul className="mt-2 max-h-72 divide-y divide-forest/10 overflow-y-auto border-y border-forest/10">
                  {sorted.map((p) => (
                    <li key={p.id}>
                      <button onClick={() => setSelected(p.id)} aria-current={selected === p.id} className={`flex w-full items-baseline justify-between gap-2 px-1 py-2 text-left text-sm hover:bg-sage ${selected === p.id ? "bg-sage" : ""}`}>
                        <span>{p.name}<span className="block text-xs text-charcoal/65">{(p.areaM2 / 1e4).toFixed(1)} ha{isPublicPark(p) ? "" : " · access not confirmed"}</span></span>
                        <span className="tabular-nums text-charcoal/75">{qualities[p.id]?.overall ?? "—"}</span>
                      </button>
                    </li>
                  ))}
                  {sorted.length === 0 && <li className="py-3 text-sm text-charcoal/70">No parks are mapped in this area. If you know of one, add it in OpenStreetMap and it will appear here.</li>}
                </ul>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
