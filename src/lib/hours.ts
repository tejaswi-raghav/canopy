import type { OpeningHours } from "./types";

/** India has no daylight saving: IST is a fixed UTC+05:30, so arithmetic is exact. */
const IST_OFFSET_MIN = 330;

export interface IstParts {
  day: number; // 0 = Sunday
  minutes: number; // minutes from midnight IST
  hour: number;
  dateKey: string; // YYYY-MM-DD in IST
}

export function istParts(d: Date): IstParts {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  const day = shifted.getUTCDay();
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return {
    day,
    minutes,
    hour: shifted.getUTCHours(),
    dateKey: shifted.toISOString().slice(0, 10),
  };
}

/** Build a Date for a given IST calendar day (YYYY-MM-DD) and hour. */
export function istDate(dateKey: string, hour: number, minute = 0): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - IST_OFFSET_MIN * 60_000);
}

export type OpenStatus = "open" | "closed" | "unknown";

export function openStatus(hours: OpeningHours | null, at: Date): OpenStatus {
  if (!hours) return "unknown";
  const { day, minutes } = istParts(at);
  const ranges = hours.ranges[day];
  if (!ranges) return "closed";
  for (const [open, close] of ranges) {
    if (close > open) {
      if (minutes >= open && minutes < close) return "open";
    } else if (minutes >= open || minutes < close) {
      // overnight range (e.g. 22:00–02:00)
      return "open";
    }
  }
  return "closed";
}

const DAY_IDX: Record<string, number> = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
const DAY_ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function expandDays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const p = part.trim();
    if (!p) return null;
    if (p.includes("-")) {
      const [a, b] = p.split("-");
      const ia = DAY_ORDER.indexOf(a);
      const ib = DAY_ORDER.indexOf(b);
      if (ia < 0 || ib < 0) return null;
      for (let i = ia; ; i = (i + 1) % 7) {
        out.add(DAY_IDX[DAY_ORDER[i]]);
        if (i === ib) break;
      }
    } else {
      if (!(p in DAY_IDX)) return null;
      out.add(DAY_IDX[p]);
    }
  }
  return [...out];
}

function parseTimeRanges(spec: string): [number, number][] | null {
  const out: [number, number][] = [];
  for (const part of spec.split(",")) {
    const m = part.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const a = Number(m[1]) * 60 + Number(m[2]);
    let b = Number(m[3]) * 60 + Number(m[4]);
    if (b === 0) b = 24 * 60;
    if (Number(m[1]) > 24 || Number(m[3]) > 24 || Number(m[2]) > 59 || Number(m[4]) > 59) return null;
    out.push([a, b]);
  }
  return out;
}

/**
 * Parse the common subset of OSM `opening_hours`: "24/7", "Mo-Su 05:00-21:00",
 * "Mo-Fr 06:00-09:00,16:00-20:00; Sa,Su 05:00-22:00", "sunrise-sunset" is NOT supported.
 * Anything else returns null, which callers must treat as *unknown*, not closed.
 */
export function parseOsmOpeningHours(raw: string | null | undefined, source = "OpenStreetMap"): OpeningHours | null {
  if (!raw) return null;
  const text = raw.trim();
  const ranges: Record<number, [number, number][]> = {};
  if (text === "24/7") {
    for (let d = 0; d < 7; d++) ranges[d] = [[0, 24 * 60]];
    return { ranges, raw: text, verified: false, source };
  }
  for (const rule of text.split(";")) {
    const r = rule.trim();
    if (!r) continue;
    const m = r.match(/^([A-Za-z,\- ]+?)\s+(\d{1,2}:\d{2}.*)$/) ?? r.match(/^()(\d{1,2}:\d{2}.*)$/);
    if (!m) return null;
    const days = m[1].trim() ? expandDays(m[1].replace(/\s/g, "")) : [0, 1, 2, 3, 4, 5, 6];
    const times = parseTimeRanges(m[2]);
    if (!days || !times) return null;
    for (const d of days) ranges[d] = times;
  }
  if (Object.keys(ranges).length === 0) return null;
  return { ranges, raw: text, verified: false, source };
}

export function dailyHours(hours: OpeningHours | null, day: number): string {
  if (!hours) return "Hours not available";
  const r = hours.ranges[day];
  if (!r || r.length === 0) return "Closed";
  const f = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return r.map(([a, b]) => `${f(a)}–${b === 1440 ? "24:00" : f(b)}`).join(", ");
}

export function uniformHours(open: string, close: string, source: string, verified = false): OpeningHours {
  const [oh, om] = open.split(":").map(Number);
  const [ch, cm] = close.split(":").map(Number);
  const ranges: Record<number, [number, number][]> = {};
  for (let d = 0; d < 7; d++) ranges[d] = [[oh * 60 + om, ch * 60 + cm]];
  return { ranges, raw: `Mo-Su ${open}-${close}`, verified, source };
}
