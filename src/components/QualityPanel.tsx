import type { EcoResult, QualityResult } from "@/lib/scoring";

export default function QualityPanel({ q, eco }: { q: QualityResult; eco: EcoResult }) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section aria-labelledby="visitor-score">
        <h3 id="visitor-score" className="font-display text-lg font-bold">Visitor experience score</h3>
        <div className="mt-2 flex items-baseline gap-2">
          {q.status === "scored" ? (
            <>
              <span className="numeral text-6xl font-extrabold text-forest">{q.overall}</span>
              <span className="text-charcoal/70">/ 100</span>
            </>
          ) : (
            <span className="text-lg font-semibold text-charcoal/70">Insufficient data</span>
          )}
        </div>
        <p className="mt-1 text-sm text-charcoal/75">
          {q.status === "scored"
            ? `Provisional, from ${Math.round(q.completeness * 100)}% of the evidence weight · ${q.confidence} confidence · assessed ${q.assessedAt ?? "date unknown"}`
            : "Not enough verified evidence to score this park. Add observations on the Contribute page."}
        </p>
        <ul className="mt-4 space-y-3">
          {q.components.map((c) => (
            <li key={c.key}>
              <div className="flex justify-between text-sm">
                <span>{c.label} <span className="text-charcoal/70">({Math.round(c.weight * 100)}%)</span></span>
                <span className="font-semibold tabular-nums">{c.score === null ? "No evidence" : `${c.score}${c.lowerBound ? "+" : ""}`}</span>
              </div>
              <div className="mt-1 h-1.5 bg-forest/10" aria-hidden>{c.score !== null && <div className="h-full bg-forest" style={{ width: `${c.score}%` }} />}</div>
              <p className="mt-0.5 text-xs text-charcoal/65">{c.evidence.join(" · ")}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-charcoal/65">A “+” means some items are unverified, so the true score may be higher.</p>
        {q.improvements.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-semibold">Where evidence or quality is lacking</h4>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-charcoal/80">{q.improvements.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        )}
        <p className="mt-4 text-xs text-charcoal/65">{q.disclaimer}</p>
      </section>

      <section aria-labelledby="eco-score">
        <h3 id="eco-score" className="font-display text-lg font-bold">Ecological quality</h3>
        <div className="mt-2 flex items-baseline gap-2">
          {eco.status === "scored" ? (
            <>
              <span className="numeral text-6xl font-extrabold text-moss">{eco.overall}</span>
              <span className="text-charcoal/70">/ 100</span>
            </>
          ) : (
            <span className="text-lg font-semibold text-charcoal/70">No vegetation data</span>
          )}
        </div>
        <p className="mt-1 text-sm text-charcoal/75">{eco.note}</p>
        <ul className="mt-4 space-y-3">
          {eco.parts.map((p) => (
            <li key={p.label}>
              <div className="flex justify-between text-sm"><span>{p.label}</span><span className="font-semibold tabular-nums">{p.score ?? "—"}</span></div>
              <div className="mt-1 h-1.5 bg-forest/10" aria-hidden>{p.score !== null && <div className="h-full bg-moss" style={{ width: `${p.score}%` }} />}</div>
              <p className="mt-0.5 text-xs text-charcoal/65">{p.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-charcoal/65">NDVI measures how green the land looks from space. It is not a measure of how good a park is to visit.</p>
      </section>
    </div>
  );
}
