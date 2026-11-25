"use client";
import { useState } from "react";
import { type GeocodeHit } from "@/lib/adapters/geocode";
import { resolveQuery } from "@/lib/dataset";
import { useArea } from "@/lib/store";
import { DEMO_SEEDS } from "@/data/demo";

export default function AreaSearch({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const { select, status, error } = useArea();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [hasDemo, setHasDemo] = useState<string | null>(null);
  const [radius, setRadius] = useState(2);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setHits([]);
    setHasDemo(null);
    try {
      const r = await resolveQuery(q);
      setHits(r.hits);
      setHasDemo(r.demo ? r.demo.slug : null);
      if (!r.demo && r.hits.length === 0) setMsg("No matching place found in India. Try a locality plus city, e.g. “Indiranagar, Bengaluru”, or a 6-digit PIN code.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Search failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function useLocation() {
    if (!navigator.geolocation) return setMsg("Your browser does not support location.");
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        void select({ kind: "live", radiusKm: radius, hit: { label: "Your location", center: c, bbox: [c[0] - 0.02, c[1] - 0.02, c[0] + 0.02, c[1] + 0.02], boundary: null, kind: "point" } });
        onDone?.();
      },
      () => setMsg("Location permission was not granted. Search for a place instead."),
      { timeout: 10_000 },
    );
  }

  const chip = "rounded-full border border-forest/25 px-3 py-1 text-sm text-forest hover:bg-forest hover:text-ivory";
  return (
    <div>
      <form onSubmit={submit} role="search" className="flex gap-2">
        <label className="sr-only" htmlFor="area-q">Where would you like to explore?</label>
        <input
          id="area-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="City, neighbourhood, PIN code or address"
          className={`min-w-0 flex-1 border border-forest/30 bg-ivory px-3 ${compact ? "py-2" : "py-3"} text-charcoal placeholder:text-charcoal/70`}
          maxLength={120}
          autoComplete="off"
        />
        <button disabled={busy || q.trim().length < 2} className="bg-forest px-4 font-semibold text-ivory disabled:opacity-50">
          {busy ? "Searching" : "Explore"}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={useLocation} className={chip}>Use my location</button>
        {["hyderabad", "jubilee-hills", "old-city", "kukatpally"].map((slug) => (
          <button key={slug} type="button" className={chip} onClick={() => { void select({ kind: "demo", slug }); onDone?.(); }}>
            {slug === "hyderabad" ? "Hyderabad (demo)" : `${DEMO_SEEDS.find((s) => s.id === slug)!.name} (demo)`}
          </button>
        ))}
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-charcoal/70">
        Radius when a place has no official boundary
        <input type="range" min={1} max={5} step={0.5} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
        <span className="tabular-nums">{radius} km</span>
      </label>

      {(hasDemo || hits.length > 0) && (
        <ul className="mt-3 divide-y divide-forest/10 border border-forest/15 bg-ivory text-sm" aria-label="Search results">
          {hasDemo && (
            <li>
              <button className="w-full px-3 py-2 text-left hover:bg-sage" onClick={() => { void select({ kind: "demo", slug: hasDemo }); setHits([]); setHasDemo(null); onDone?.(); }}>
                <span className="font-semibold">Hyderabad area — demonstration data</span>
                <span className="block text-xs text-charcoal/65">Synthetic parks and population so every feature can be tried offline</span>
              </button>
            </li>
          )}
          {hits.map((h, i) => (
            <li key={i}>
              <button className="w-full px-3 py-2 text-left hover:bg-sage" onClick={() => { void select({ kind: "live", hit: h, radiusKm: radius }); setHits([]); setHasDemo(null); onDone?.(); }}>
                <span className="font-semibold">Live from OpenStreetMap</span>
                <span className="block text-xs text-charcoal/70">{h.label}{h.boundary ? "" : ` · ${radius} km radius`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(msg || (status === "error" && error)) && <p role="alert" className="mt-3 text-sm text-[#7E2A1C]">{msg ?? error}</p>}
      {status === "loading" && <p className="mt-3 text-sm text-charcoal/70" role="status">Loading area…</p>}
    </div>
  );
}
