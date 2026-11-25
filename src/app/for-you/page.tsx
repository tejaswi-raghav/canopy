"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { demoWeather, fetchWeather, type WeatherResult } from "@/lib/adapters/weather";
import { centroidOf } from "@/lib/geo";
import { istDate, istParts } from "@/lib/hours";
import { parkHref } from "@/lib/links";
import { ACTIVITY_LABELS, AGE_SUGGESTIONS, explain, recommend, REC_WEIGHTS, type UserPrefs } from "@/lib/recommend";
import { useArea } from "@/lib/store";
import { AGE_GROUPS, type ActivityKey, type AgeGroup, type LonLat } from "@/lib/types";
import { DemoBadge } from "@/components/ui";
import { fmtHour } from "@/lib/planner";

const ALL: ActivityKey[] = Object.keys(ACTIVITY_LABELS) as ActivityKey[];

export default function ForYou() {
  const { dataset } = useArea();
  const today = istParts(new Date()).dateKey;
  const [age, setAge] = useState<AgeGroup | undefined>();
  const [acts, setActs] = useState<ActivityKey[]>(["walking"]);
  const [km, setKm] = useState(3);
  const [minutes, setMinutes] = useState(60);
  const [wheelchair, setWheelchair] = useState(false);
  const [ambience, setAmbience] = useState<"quiet" | "social" | "any">("any");
  const [shade, setShade] = useState(false);
  const [date, setDate] = useState(today);
  const [hour, setHour] = useState(Math.min(21, Math.max(5, istParts(new Date()).hour + 1)));
  const [origin, setOrigin] = useState<LonLat | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [wx, setWx] = useState<{ state: "loading" | "ok" | "error"; data?: WeatherResult; error?: string }>({ state: "loading" });

  const center = useMemo<LonLat | null>(() => (dataset ? centroidOf(dataset.boundary) : null), [dataset]);
  const from = origin ?? center;

  useEffect(() => {
    if (!from) return;
    const ac = new AbortController();
    setWx({ state: "loading" });
    fetchWeather(from[1], from[0], date, ac.signal)
      .then((data) => setWx({ state: "ok", data }))
      .catch((e) => {
        if (ac.signal.aborted) return;
        if (dataset?.mode === "demo") setWx({ state: "ok", data: demoWeather(from[1], date) });
        else setWx({ state: "error", error: e instanceof Error ? e.message : "unavailable" });
      });
    return () => ac.abort();
  }, [from, date, dataset?.mode]);

  const result = useMemo(() => {
    if (!dataset || !from) return null;
    const prefs: UserPrefs = { origin: from, ageGroup: age, activities: acts, maxDistanceM: km * 1000, minutesAvailable: minutes, wheelchair, ambience, preferShade: shade };
    return recommend(dataset.parks, prefs, istDate(date, hour, 0), wx.data?.byHour, { limit: 5 });
  }, [dataset, from, age, acts, km, minutes, wheelchair, ambience, shade, date, hour, wx.data]);

  function locate() {
    if (!navigator.geolocation) return setLocMsg("Your browser does not support location.");
    navigator.geolocation.getCurrentPosition(
      (p) => { setOrigin([p.coords.longitude, p.coords.latitude]); setLocMsg(null); },
      () => setLocMsg("Location was not shared, so the centre of the selected area is used."),
      { timeout: 10_000 },
    );
  }
  const toggle = (a: ActivityKey) => setActs((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]));
  const field = "border border-forest/30 bg-ivory px-2 py-1.5";

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[360px_1fr]">
      <form className="space-y-6" aria-label="Your preferences" onSubmit={(e) => e.preventDefault()}>
        <header>
          <h1 className="font-display text-4xl font-extrabold leading-tight text-forest">Parks for you</h1>
          <p className="mt-2 text-charcoal/80">{dataset ? <>Searching <strong>{dataset.label}</strong> <DemoBadge demo={dataset.mode === "demo"} />. Change the area on <Link className="underline" href="/explore/">Explore</Link>.</> : "Loading area…"}</p>
        </header>

        <fieldset>
          <legend className="font-semibold">Age group <span className="font-normal text-charcoal/70">(optional)</span></legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {AGE_GROUPS.map((g) => (
              <button type="button" key={g.id} aria-pressed={age === g.id} onClick={() => setAge(age === g.id ? undefined : g.id)} className={`rounded-full border px-3 py-1 text-sm ${age === g.id ? "border-forest bg-forest text-ivory" : "border-forest/30 text-forest"}`}>{g.label}</button>
            ))}
          </div>
          {age && (
            <p className="mt-2 text-sm text-charcoal/75">
              Often chosen at this age:{" "}
              {AGE_SUGGESTIONS[age].map((a) => <button type="button" key={a} onClick={() => setActs((x) => (x.includes(a) ? x : [...x, a]))} className="mr-2 underline underline-offset-2">{ACTIVITY_LABELS[a]}</button>)}
              <span className="block text-xs">Suggestions only. Choose anything you like.</span>
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="font-semibold">What would you like to do?</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ALL.map((a) => {
              const on = acts.includes(a);
              return <button type="button" key={a} aria-pressed={on} onClick={() => toggle(a)} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-forest bg-forest text-ivory" : "border-forest/30 text-forest"}`}>{ACTIVITY_LABELS[a]}</button>;
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm">Day<input type="date" className={`mt-1 w-full ${field}`} value={date} min={today} max={istParts(new Date(Date.now() + 14 * 86_400_000)).dateKey} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
          <label className="text-sm">Start time<select className={`mt-1 w-full ${field}`} value={hour} onChange={(e) => setHour(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{fmtHour(h)}</option>)}</select></label>
          <div className="col-span-2 flex gap-2 text-sm">
            <button type="button" className="border border-forest/40 px-3 py-1 text-forest" onClick={() => setHour(7)}>Morning</button>
            <button type="button" className="border border-forest/40 px-3 py-1 text-forest" onClick={() => setHour(18)}>Evening</button>
          </div>
        </div>

        <label className="block text-sm">Furthest I will travel: <strong>{km} km</strong>
          <input type="range" min={0.5} max={10} step={0.5} value={km} onChange={(e) => setKm(Number(e.target.value))} className="mt-1 w-full" />
        </label>
        <label className="block text-sm">Time available: <strong>{minutes} min</strong>
          <input type="range" min={15} max={180} step={15} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="mt-1 w-full" />
        </label>

        <fieldset className="space-y-2 text-sm">
          <legend className="font-semibold">Comfort and access</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked={wheelchair} onChange={(e) => setWheelchair(e.target.checked)} />I need wheelchair-accessible paths</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={shade} onChange={(e) => setShade(e.target.checked)} />Prefer shaded areas</label>
          <div className="flex gap-4 pt-1">
            {(["quiet", "social", "any"] as const).map((a) => <label key={a} className="flex items-center gap-1.5"><input type="radio" name="amb" checked={ambience === a} onChange={() => setAmbience(a)} />{a === "any" ? "No preference" : a === "quiet" ? "Quiet" : "Social"}</label>)}
          </div>
          {ambience !== "any" && <p className="text-xs text-charcoal/65">Quiet or social needs verified crowd data, which does not exist yet, so this has no effect for now.</p>}
        </fieldset>

        <div className="text-sm">
          <button type="button" onClick={locate} className="border border-forest/40 px-3 py-1.5 text-forest">{origin ? "Using your location" : "Use my location as the start"}</button>
          {locMsg && <p className="mt-1 text-xs text-charcoal/70">{locMsg}</p>}
          {!origin && <p className="mt-1 text-xs text-charcoal/65">Distances are measured from the centre of the selected area. Straight-line distance.</p>}
        </div>
      </form>

      <section aria-live="polite" aria-label="Recommendations">
        {!result && <p>Loading…</p>}
        {result && (
          <>
            <p className="text-sm text-charcoal/75">
              {wx.state === "loading" && "Loading weather… "}
              {wx.state === "error" && <span className="text-[#7E2A1C]">Weather unavailable ({wx.error}); ranking ignores weather. </span>}
              {wx.state === "ok" && wx.data && <>Weather: {wx.data.source}{wx.data.demo ? " (illustrative only). " : ". "}</>}
              Weights: {Object.entries(result.weightsUsed).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(", ")}
              {result.missing.length > 0 && <> · no data for: {result.missing.join(", ")}</>}.
            </p>
            {result.recommendations.length === 0 ? (
              <div className="mt-6 border-l-2 border-forest pl-4">
                <h2 className="font-display text-2xl font-bold">No park fits right now</h2>
                <p className="mt-1 max-w-prose">{result.rejected.length} parks were ruled out. Try a later time, a longer distance, or fewer must-have activities.</p>
              </div>
            ) : (
              <ol className="mt-6 divide-y divide-forest/15">
                {result.recommendations.map((r, i) => (
                  <li key={r.park.id} className="py-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <h2 className="font-display text-2xl font-bold text-forest"><span className="mr-2 text-charcoal/70">{i + 1}.</span><Link href={parkHref(r.park)} className="underline-offset-4 hover:underline">{r.park.name}</Link></h2>
                      <span className="numeral text-3xl font-extrabold text-forest" aria-label={`match ${r.score} out of 100`}>{r.score}</span>
                    </div>
                    <p className="mt-1 text-sm text-charcoal/70">{(r.distM / 1000).toFixed(1)} km · {r.status === "open" ? "open then" : r.status === "unknown" ? "hours not verified" : "closed"} · {(r.park.areaM2 / 1e4).toFixed(1)} ha</p>
                    <p className="mt-2 max-w-prose">{explain(r)}</p>
                  </li>
                ))}
              </ol>
            )}
            {result.alternatives.length > 0 && (
              <section className="mt-8" aria-label="Alternatives">
                <h2 className="font-display text-xl font-bold">If the first choice is closed, crowded or the weather turns</h2>
                <ul className="mt-2 space-y-1">{result.alternatives.map((r) => <li key={r.park.id}><Link className="underline underline-offset-2" href={parkHref(r.park)}>{r.park.name}</Link> — {r.score}, {(r.distM / 1000).toFixed(1)} km</li>)}</ul>
              </section>
            )}
            {result.rejected.length > 0 && (
              <details className="mt-8 text-sm">
                <summary className="cursor-pointer font-semibold">{result.rejected.length} parks ruled out, and why</summary>
                <ul className="mt-2 max-h-64 overflow-y-auto">{result.rejected.slice(0, 80).map((r) => <li key={r.park.id}>{r.park.name}: {r.reason}</li>)}</ul>
              </details>
            )}
            <p className="mt-8 max-w-prose text-xs text-charcoal/65">Recommendations are computed by a transparent weighted model (activity {REC_WEIGHTS.activity * 100}%, distance {REC_WEIGHTS.distance * 100}%, quality {REC_WEIGHTS.quality * 100}%, weather {REC_WEIGHTS.weather * 100}%, infrastructure {REC_WEIGHTS.infrastructure * 100}%, crowd {REC_WEIGHTS.crowd * 100}%), re-weighted when data is missing. Parks are only ruled out for confirmed reasons.</p>
          </>
        )}
      </section>
    </div>
  );
}
