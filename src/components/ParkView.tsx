"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { demoDataset } from "@/data/demo";
import AmenityGrid from "./AmenityGrid";
import HourlyPlanner from "./HourlyPlanner";
import MiniMap from "./MiniMap";
import QualityPanel from "./QualityPanel";
import { DemoBadge } from "./ui";
import { dailyHours, istParts, openStatus } from "@/lib/hours";
import { computeEcologicalScore, computeQuality } from "@/lib/scoring";
import { useArea } from "@/lib/store";
import { REPORT_LABELS, type Report } from "@/lib/community";
import type { AreaDataset, Park } from "@/lib/types";

export default function ParkView({ routeId }: { routeId: string }) {
  const sp = useSearchParams();
  const { dataset } = useArea();
  const id = routeId === "live" ? sp.get("ref") ?? "" : routeId;

  const found = useMemo<{ park: Park; ds: AreaDataset } | null>(() => {
    if (id.startsWith("demo-")) {
      const slug = DEMO_SEEDS_SLUG(id);
      const ds = slug ? demoDataset(slug) : null;
      const park = ds?.parks.find((p) => p.id === id);
      return ds && park ? { park, ds } : null;
    }
    const park = dataset?.parks.find((p) => p.id === id);
    return dataset && park ? { park, ds: dataset } : null;
  }, [id, dataset]);

  const [reports, setReports] = useState<Report[]>([]);
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem("canopy.reports") ?? "[]") as Report[];
      setReports(all.filter((r) => r.parkId === id));
    } catch {
      setReports([]);
    }
  }, [id]);

  if (!found) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="font-display text-3xl font-extrabold text-forest">Park not loaded</h1>
        <p className="mt-3">Live parks are loaded in your browser, so this page needs the area open first. Search for the area on Explore, select the park, then open its profile.</p>
        <Link href="/explore/" className="mt-5 inline-block bg-forest px-4 py-2 font-semibold text-ivory">Go to Explore</Link>
      </div>
    );
  }
  const { park, ds } = found;
  const q = computeQuality(park);
  const eco = computeEcologicalScore(park);
  const now = new Date();
  const st = openStatus(park.hours, now);
  const [lon, lat] = park.centroid;

  return (
    <article className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <p className="text-sm"><Link href="/explore/" className="text-forest underline underline-offset-2">← Explore</Link></p>
      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-3"><DemoBadge demo={park.provenance.demo === true} /><span className="text-sm text-charcoal/70">{ds.label}</span></div>
        <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight text-forest sm:text-5xl">{park.name}</h1>
        <p className="mt-2 text-lg text-charcoal/80">
          {(park.areaM2 / 1e4).toFixed(1)} hectares · {park.kind.replace(/_/g, " ")} · {st === "open" ? <strong className="text-forest">open now</strong> : st === "closed" ? "closed now" : "opening hours not available"}
        </p>
      </header>

      <section className="mt-8 grid gap-8 md:grid-cols-[1fr_260px]" aria-label="Facts">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {[
            ["Public access", park.access === "public" ? "Public" : park.access === "unknown" ? "Not confirmed" : park.access],
            ["Entry fee", park.feeInr === null ? "Not available" : park.feeInr === 0 ? "Free" : `₹${park.feeInr}`],
            ["Managed by", park.authority ?? "Not available"],
            ["Opening hours", park.hours ? `${dailyHours(park.hours, istParts(now).day)} today (${park.hours.verified ? "verified" : "unverified"})` : "Not available"],
            ["Last verified inspection", park.assessment.kind === "official_inspection" ? park.assessment.assessedAt ?? "Date unknown" : "None on record"],
            ["Maintenance frequency", "Not documented"],
            ["Location", `${lat.toFixed(5)}, ${lon.toFixed(5)}`],
            ["Data source", park.provenance.source],
          ].map(([k, v]) => (
            <div key={k}><dt className="text-sm text-charcoal/65">{k}</dt><dd className="font-medium">{v}</dd></div>
          ))}
          <div className="sm:col-span-2 flex flex-wrap gap-3 text-sm">
            <a className="underline underline-offset-2" href={`https://www.openstreetmap.org/directions?to=${lat}%2C${lon}`} target="_blank" rel="noreferrer">Directions on OpenStreetMap</a>
            <a className="underline underline-offset-2" href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`} target="_blank" rel="noreferrer">Directions on Google Maps</a>
            {park.osmRef && <a className="underline underline-offset-2" href={`https://www.openstreetmap.org/${park.osmRef}`} target="_blank" rel="noreferrer">View or edit on OpenStreetMap</a>}
          </div>
        </dl>
        <div>
          <MiniMap ds={{ ...ds, parks: [park], boundary: park.geometry }} w={260} h={190} />
          <p className="mt-1 text-xs text-charcoal/65">Photographs: none shown. Canopy only displays images with a clear licence, and none have been added for this park.</p>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="amen"><h2 id="amen" className="font-display text-2xl font-bold">Facilities</h2><div className="mt-4"><AmenityGrid amenities={park.amenities} /></div></section>

      <section className="mt-12" aria-labelledby="qual"><h2 id="qual" className="font-display text-2xl font-bold">Quality</h2><div className="mt-4"><QualityPanel q={q} eco={eco} /></div></section>

      <section className="mt-12" aria-labelledby="plan"><h2 id="plan" className="font-display text-2xl font-bold">Plan your visit</h2><div className="mt-4"><HourlyPlanner park={park} demo={ds.mode === "demo"} /></div></section>

      <section className="mt-12" aria-labelledby="rep">
        <h2 id="rep" className="font-display text-2xl font-bold">Community observations</h2>
        {reports.length === 0 ? (
          <p className="mt-3 text-charcoal/75">No observations from this device yet. <Link className="underline" href={`/contribute/?park=${encodeURIComponent(park.id)}`}>Report a problem or a missing facility</Link>.</p>
        ) : (
          <ul className="mt-3 divide-y divide-forest/10">{reports.map((r) => <li key={r.id} className="py-2 text-sm"><strong>{REPORT_LABELS[r.category]}</strong> · {r.observedAt.slice(0, 10)} · {r.status}<span className="block text-charcoal/75">{r.description}</span></li>)}</ul>
        )}
        <p className="mt-3 text-xs text-charcoal/65">Community observations are not official municipal records.</p>
      </section>
    </article>
  );
}

function DEMO_SEEDS_SLUG(id: string): string | null {
  const m = id.match(/^demo-(.+)-\d+$/);
  return m ? m[1] : null;
}
