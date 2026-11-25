/**
 * Sunrise / sunset (NOAA general solar position equations). Used only when a weather
 * provider does not return daylight; accuracy is ±~2 minutes, enough for visit planning.
 * Returns minutes from midnight IST, or null for polar day/night.
 */
export function sunTimesIst(dateKey: string, lat: number, lon: number): { sunrise: number; sunset: number } | null {
  const [y, m, d] = dateKey.split("-").map(Number);
  const start = Date.UTC(y, 0, 0);
  const n = Math.floor((Date.UTC(y, m - 1, d) - start) / 86_400_000);
  const rad = Math.PI / 180;
  const gamma = ((2 * Math.PI) / 365) * (n - 1 + (12 - 12) / 24);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const cosHa =
    Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  if (cosHa > 1 || cosHa < -1) return null;
  const ha = Math.acos(cosHa) / rad;
  const sunriseUtc = 720 - 4 * (lon + ha) - eqTime;
  const sunsetUtc = 720 - 4 * (lon - ha) - eqTime;
  return { sunrise: sunriseUtc + 330, sunset: sunsetUtc + 330 };
}

export function isDaylight(dateKey: string, hour: number, lat: number, lon: number): boolean | null {
  const t = sunTimesIst(dateKey, lat, lon);
  if (!t) return null;
  const mid = hour * 60 + 30;
  return mid >= t.sunrise && mid <= t.sunset;
}
