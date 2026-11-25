"use client";
import { useEffect, useMemo, useState } from "react";
import { demoWeather, fetchWeather, type WeatherResult } from "@/lib/adapters/weather";
import { istParts } from "@/lib/hours";
import { fmtHour, hourlyPlan } from "@/lib/planner";
import { ACTIVITY_LABELS } from "@/lib/recommend";
import type { ActivityKey, AgeGroup, Park } from "@/lib/types";

const QUICK: ActivityKey[] = ["walking", "jogging", "yoga", "outdoor_gym", "playground", "relax"];

export default function HourlyPlanner({ park, demo, ageGroup, initial }: { park: Park; demo: boolean; ageGroup?: AgeGroup; initial?: ActivityKey[] }) {
  const today = istParts(new Date()).dateKey;
  const [date, setDate] = useState(today);
  const [acts, setActs] = useState<ActivityKey[]>(initial?.length ? initial : ["walking"]);
  const [w, setW] = useState<{ state: "loading" | "ok" | "error"; data?: WeatherResult; error?: string }>({ state: "loading" });
  const [hour, setHour] = useState<number>(istParts(new Date()).hour);

  useEffect(() => {
    const ac = new AbortController();
    setW({ state: "loading" });
    fetchWeather(park.centroid[1], park.centroid[0], date, ac.signal)
      .then((data) => setW({ state: "ok", data }))
      .catch((e) => {
        if (ac.signal.aborted) return;
        if (demo) setW({ state: "ok", data: demoWeather(park.centroid[1], date) });
        else setW({ state: "error", error: e instanceof Error ? e.message : "Weather unavailable" });
      });
    return () => ac.abort();
  }, [park.centroid, date, demo]);

  const plan = useMemo(() => hourlyPlan(park, date, w.data?.byHour, acts, ageGroup), [park, date, w.data, acts, ageGroup]);
  const sel = plan.slots[hour];
  const maxDate = new Date(Date.now() + 14 * 86_400_000);
  const maxKey = istParts(maxDate).dateKey;
  const wd = new Date(`${date}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" });

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="block text-charcoal/70">Day</span>
          <input type="date" value={date} min={today} max={maxKey} onChange={(e) => e.target.value && setDate(e.target.value)} className="border border-forest/30 bg-ivory px-2 py-1.5" />
        </label>
        <fieldset>
          <legend className="text-sm text-charcoal/70">Activity</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {QUICK.map((a) => {
              const on = acts.includes(a);
              return (
                <button key={a} type="button" aria-pressed={on} onClick={() => setActs((x) => (on ? (x.length > 1 ? x.filter((y) => y !== a) : x) : [...x, a]))} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-forest bg-forest text-ivory" : "border-forest/30 text-forest"}`}>
                  {ACTIVITY_LABELS[a]}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <p className="mt-4 text-sm" aria-live="polite">
        {w.state === "loading" && "Loading conditions…"}
        {w.state === "error" && <span className="text-[#7E2A1C]">Weather could not be loaded ({w.error}). Opening hours are still shown; suitability needs weather.</span>}
        {w.state === "ok" && plan.windows.length > 0 && (
          <>Good windows on {wd}: <strong>{plan.windows.map((x) => `${fmtHour(x.from)}–${fmtHour(x.to)}`).join(", ")}</strong></>
        )}
        {w.state === "ok" && plan.windows.length === 0 && `No hour on ${wd} meets the comfort threshold for the chosen activity.`}
      </p>

      <ol className="mt-3 flex items-end gap-[3px]" aria-label="Hour-by-hour suitability, 12am to 11pm">
        {plan.slots.map((s) => {
          const hgt = s.suitability === null ? 8 : Math.max(6, s.suitability * 100);
          return (
            <li key={s.hour} className="flex-1">
              <button onClick={() => setHour(s.hour)} aria-pressed={hour === s.hour} aria-label={`${fmtHour(s.hour)}: ${s.status === "closed" ? "closed" : s.recommended ? "recommended" : s.suitability === null ? "no weather data" : "less suitable"}`} className={`flex h-28 w-full flex-col justify-end border ${hour === s.hour ? "border-forest" : "border-transparent"}`}>
                <span
                  className="block w-full"
                  style={{
                    height: `${hgt}%`,
                    background: s.status === "closed" ? "repeating-linear-gradient(45deg,#d7d9cc,#d7d9cc 3px,#eceee2 3px,#eceee2 6px)" : s.recommended ? "#173F35" : s.suitability === null ? "transparent" : "#8EAD82",
                    border: s.suitability === null && s.status !== "closed" ? "1px dashed #202620" : undefined,
                  }}
                />
              </button>
              <span className="mt-1 block text-center text-[10px] text-charcoal/70">{s.hour % 3 === 0 ? fmtHour(s.hour) : ""}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-1 text-xs text-charcoal/65">Dark = recommended · green = open but less suitable · hatched = closed · dashed = no weather data. Opening hours: {park.hours ? (park.hours.verified ? "verified" : "unverified") : "not available"}.</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
        <div><dt className="text-charcoal/65">At {fmtHour(hour)}</dt><dd className="font-semibold">{sel.status === "open" ? "Open" : sel.status === "closed" ? "Closed" : "Hours unknown"}</dd></div>
        <div><dt className="text-charcoal/65">Temperature</dt><dd className="font-semibold">{sel.weather?.tempC != null ? `${Math.round(sel.weather.tempC)}°C` : "—"}</dd></div>
        <div><dt className="text-charcoal/65">Rain chance</dt><dd className="font-semibold">{sel.weather?.rainProb != null ? `${Math.round(sel.weather.rainProb)}%` : "—"}</dd></div>
        <div><dt className="text-charcoal/65">Air quality (US AQI)</dt><dd className="font-semibold">{sel.weather?.aqi != null ? Math.round(sel.weather.aqi) : "—"}</dd></div>
        <div><dt className="text-charcoal/65">UV · daylight</dt><dd className="font-semibold">{sel.weather?.uv != null ? sel.weather.uv.toFixed(0) : "—"} · {sel.weather?.isDaylight == null ? "—" : sel.weather.isDaylight ? "day" : "dark"}</dd></div>
      </dl>
      {sel.notes.length > 0 && <p className="mt-2 text-sm text-charcoal/75">Conditions: {sel.notes.join(", ")}.</p>}

      <div className="mt-4 space-y-1 text-xs text-charcoal/65">
        <p>Typical crowd levels: no verified crowd data exists for this park, so none is shown.</p>
        {w.data && <p>Weather source: {w.data.source}{w.data.demo ? " — illustrative curve only" : ""}.</p>}
      </div>
    </div>
  );
}
