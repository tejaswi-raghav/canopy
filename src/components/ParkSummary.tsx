"use client";
import Link from "next/link";
import { dailyHours, istParts, openStatus } from "@/lib/hours";
import { parkHref } from "@/lib/links";
import { AMENITY_KEYS, AMENITY_LABELS, type Park } from "@/lib/types";
import type { QualityResult } from "@/lib/scoring";
import { AmenityIcon } from "./icons";

export default function ParkSummary({ park, q, onClose, onWalk, walkOn }: { park: Park; q: QualityResult; onClose: () => void; onWalk: () => void; walkOn: boolean }) {
  const now = new Date();
  const st = openStatus(park.hours, now);
  const confirmed = AMENITY_KEYS.filter((k) => park.amenities[k] === "available");
  return (
    <section aria-label={`${park.name} summary`} className="border-t border-forest/15 pt-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-display text-xl font-extrabold leading-tight text-forest">{park.name}</h2>
        <button onClick={onClose} className="shrink-0 text-sm text-forest underline underline-offset-2" aria-label="Close park summary">Close</button>
      </div>
      <p className="mt-1 text-sm text-charcoal/75">
        {(park.areaM2 / 1e4).toFixed(1)} ha · {park.access === "public" ? "public" : park.access === "unknown" ? "public access not confirmed" : park.access} ·{" "}
        {st === "open" ? <strong className="text-forest">open now</strong> : st === "closed" ? "closed now" : "opening hours not available"}
        {park.hours && <> · today {dailyHours(park.hours, istParts(now).day)}</>}
      </p>
      <div className="mt-3 flex items-center gap-4">
        <div>
          {q.status === "scored" ? <span className="numeral text-4xl font-extrabold text-forest">{q.overall}<span className="text-base font-normal text-charcoal/70">/100</span></span> : <span className="text-sm font-semibold text-charcoal/70">Quality: insufficient data</span>}
          {q.status === "scored" && <div className="text-xs text-charcoal/65">{q.confidence} confidence · {Math.round(q.completeness * 100)}% evidence</div>}
        </div>
      </div>
      <div className="mt-3">
        <h3 className="text-xs font-semibold text-charcoal/70">Confirmed facilities</h3>
        {confirmed.length ? (
          <ul className="mt-1 flex flex-wrap gap-2">{confirmed.map((k) => <li key={k} title={AMENITY_LABELS[k]}><AmenityIcon k={k} state="available" size={24} /></li>)}</ul>
        ) : <p className="text-sm text-charcoal/65">None confirmed yet.</p>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={parkHref(park)} className="bg-forest px-3 py-1.5 font-semibold text-ivory">Open full profile</Link>
        <button onClick={onWalk} aria-pressed={walkOn} className={`border px-3 py-1.5 ${walkOn ? "border-forest bg-sage" : "border-forest/40"} text-forest`}>Show 5, 10, 15 min walk</button>
      </div>
    </section>
  );
}
