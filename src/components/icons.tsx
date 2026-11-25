import type { AmenityKey, AmenityState } from "@/lib/types";
import { AMENITY_LABELS } from "@/lib/types";

/** Simple 24×24 stroke glyphs. State is encoded by treatment, never by colour alone. */
const PATHS: Record<AmenityKey, string> = {
  walking_track: "M4 20c4-1 4-6 8-6s4-6 8-10M4 20h.01M20 4h.01",
  running_track: "M8 6h8a6 6 0 010 12H8A6 6 0 018 6z",
  cycling_path: "M6 19a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM18 19a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM6 15.5l4-7h5l3 7M10 8.5l3 7",
  outdoor_gym: "M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12",
  swings: "M4 21L8 3h8l4 18M9 3v12M15 3v12M7.5 15h3M13.5 15h3",
  slides: "M5 21V6a2 2 0 012-2h1M8 8l9 11h4M5 21h2",
  playground: "M6 21V8l6-4 6 4v13M9 21v-6h6v6",
  basketball: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 3v18M3 12h18M5.6 5.6c3 3 3 10.8 0 12.8M18.4 5.6c-3 3-3 10.8 0 12.8",
  badminton: "M15 4a5 5 0 110 10 5 5 0 010-10zM11.5 12.5L4 20",
  football: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 8l3.5 2.5-1.3 4h-4.4l-1.3-4zM12 8V3M15.5 10.5L20 9M14.2 14.5L17 18.5M9.8 14.5L7 18.5M8.5 10.5L4 9",
  yoga: "M12 7a2 2 0 100-4 2 2 0 000 4zM12 8v5M5 11l7 2 7-2M8 21l4-8 4 8",
  benches: "M5 10h14M5 14h14M7 14v5M17 14v5M7 10V6M17 10V6",
  drinking_water: "M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z",
  toilets: "M7 4.5a1.5 1.5 0 100 .01M5 9h4v6H8v6H6v-6H5zM17 4.5a1.5 1.5 0 100 .01M15 9h4l-1 6h-1v6h-1v-6h-1z",
  accessible_paths: "M10 4.5a1.5 1.5 0 100 .01M10 8v6h5l3 5M7 12a5 5 0 105 7",
  lighting: "M12 3a5 5 0 013 9v3H9v-3a5 5 0 013-9zM10 18h4M10.5 21h3",
  parking: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM9 17V7h4a3 3 0 010 6H9",
  shaded_seating: "M3 12a9 9 0 0118 0H3zM12 12v8a2 2 0 004 0",
  security: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  pet_friendly: "M7 10.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM17 10.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM10 6.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM14 6.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM12 12c3 0 5 3 5 5.5S15 20 12 20s-5-.5-5-2.5S9 12 12 12z",
};

export function AmenityIcon({ k, state, size = 28 }: { k: AmenityKey; state: AmenityState; size?: number }) {
  const label = `${AMENITY_LABELS[k]}: ${state}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={label}
      stroke={state === "available" ? "#173F35" : "#202620"}
      strokeWidth={state === "available" ? 1.9 : 1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={state === "unverified" ? "2 2.2" : undefined}
      opacity={state === "available" ? 1 : state === "unverified" ? 0.6 : 0.4}
    >
      <title>{label}</title>
      <path d={PATHS[k]} />
      {state === "unavailable" && <path d="M4 4l16 16" stroke="#202620" strokeWidth="1.6" />}
    </svg>
  );
}
