import { istDate, openStatus, type OpenStatus } from "./hours";
import { ACTIVITY_INTENSITY, weatherSuitability } from "./recommend";
import { isDaylight } from "./sun";
import type { ActivityKey, AgeGroup, HourWeather, Park } from "./types";

export interface HourSlot {
  hour: number;
  status: OpenStatus;
  weather: HourWeather | null;
  suitability: number | null; // 0..1
  notes: string[];
  recommended: boolean;
  /** only populated when verified aggregate crowd data exists; never fabricated */
  crowdPct: number | null;
}

export interface Window {
  from: number;
  to: number; // exclusive
}

export function hourlyPlan(
  park: Park,
  dateKey: string,
  weather: Record<number, HourWeather> | undefined,
  activities: ActivityKey[],
  ageGroup?: AgeGroup,
): { slots: HourSlot[]; windows: Window[] } {
  const intensity = Math.max(0, ...activities.map((a) => ACTIVITY_INTENSITY[a])) as 0 | 1 | 2;
  const lighting = park.amenities.lighting === "available" ? true : park.amenities.lighting === "unavailable" ? false : null;
  const slots: HourSlot[] = [];
  for (let h = 0; h < 24; h++) {
    const at = istDate(dateKey, h, 30);
    const status = openStatus(park.hours, at);
    let w = weather?.[h] ?? null;
    if (w && w.isDaylight === null) w = { ...w, isDaylight: isDaylight(dateKey, h, park.centroid[1], park.centroid[0]) };
    const ws = weatherSuitability(w ?? undefined, intensity, ageGroup, lighting);
    const suit = status === "closed" ? 0 : ws.score;
    slots.push({
      hour: h,
      status,
      weather: w,
      suitability: suit,
      notes: ws.notes,
      recommended: status !== "closed" && suit !== null && suit >= 0.7,
      crowdPct: null,
    });
  }
  const windows: Window[] = [];
  let start: number | null = null;
  slots.forEach((s, i) => {
    if (s.recommended && start === null) start = i;
    if ((!s.recommended || i === 23) && start !== null) {
      windows.push({ from: start, to: s.recommended ? i + 1 : i });
      start = null;
    }
  });
  return { slots, windows };
}

export const fmtHour = (h: number) => {
  const hh = ((h % 24) + 24) % 24;
  const suffix = hh >= 12 ? "pm" : "am";
  const v = hh % 12 === 0 ? 12 : hh % 12;
  return `${v}${suffix}`;
};
