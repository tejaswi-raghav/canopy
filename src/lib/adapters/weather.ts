import type { HourWeather } from "../types";

export interface WeatherResult {
  byHour: Record<number, HourWeather>;
  source: string;
  demo: boolean;
  fetchedAt: string;
}

/** Map Open-Meteo hourly arrays (already in Asia/Kolkata) to our per-hour records for one IST date. */
export function parseOpenMeteo(forecast: any, air: any | null, dateKey: string): Record<number, HourWeather> {
  const out: Record<number, HourWeather> = {};
  const ft: string[] = forecast?.hourly?.time ?? [];
  const at: string[] = air?.hourly?.time ?? [];
  for (let i = 0; i < ft.length; i++) {
    if (!ft[i].startsWith(dateKey)) continue;
    const hour = Number(ft[i].slice(11, 13));
    const ai = at.indexOf(ft[i]);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    out[hour] = {
      hour,
      tempC: num(forecast.hourly.temperature_2m?.[i]),
      rainProb: num(forecast.hourly.precipitation_probability?.[i]),
      uv: num(forecast.hourly.uv_index?.[i]),
      isDaylight: forecast.hourly.is_day ? forecast.hourly.is_day[i] === 1 : null,
      aqi: ai >= 0 ? num(air?.hourly?.us_aqi?.[ai]) : null,
    };
  }
  return out;
}

export async function fetchWeather(lat: number, lon: number, dateKey: string, signal?: AbortSignal): Promise<WeatherResult> {
  const p = new URLSearchParams({ latitude: String(lat), longitude: String(lon), timezone: "Asia/Kolkata", start_date: dateKey, end_date: dateKey });
  const f = await fetch(`https://api.open-meteo.com/v1/forecast?${p}&hourly=temperature_2m,precipitation_probability,uv_index,is_day`, { signal });
  if (!f.ok) throw new Error(`Open-Meteo responded ${f.status}`);
  let air: any = null;
  try {
    const a = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${p}&hourly=us_aqi`, { signal });
    if (a.ok) air = await a.json();
  } catch {
    /* air quality is optional */
  }
  const byHour = parseOpenMeteo(await f.json(), air, dateKey);
  if (Object.keys(byHour).length === 0) throw new Error("No hourly data returned for that date (forecast range is limited).");
  return { byHour, source: "Open-Meteo (forecast + air quality)", demo: false, fetchedAt: new Date().toISOString() };
}

/**
 * DEMONSTRATION weather: a smooth diurnal curve typical of a warm Indian city. Used only in demo mode
 * when the live provider cannot be reached, and always labelled as not a forecast.
 */
export function demoWeather(lat: number, dateKey: string): WeatherResult {
  const byHour: Record<number, HourWeather> = {};
  const month = Number(dateKey.slice(5, 7));
  const base = month >= 3 && month <= 6 ? 33 : month >= 11 || month <= 2 ? 26 : 29;
  for (let h = 0; h < 24; h++) {
    const t = base - 5 + 7 * Math.max(0, Math.sin(((h - 7) / 24) * 2 * Math.PI));
    byHour[h] = {
      hour: h,
      tempC: Math.round(t * 10) / 10,
      rainProb: month >= 6 && month <= 9 ? 45 : 8,
      aqi: h >= 7 && h <= 10 ? 105 : 80,
      uv: h >= 10 && h <= 15 ? 9 : h >= 8 && h <= 17 ? 4 : 0,
      isDaylight: h >= 6 && h < 18,
    };
  }
  void lat;
  return { byHour, source: "Demonstration weather — not a forecast", demo: true, fetchedAt: new Date().toISOString() };
}
