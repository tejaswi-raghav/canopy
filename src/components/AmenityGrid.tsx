import { AMENITY_LABELS, type Amenities, type AmenityKey } from "@/lib/types";
import { AmenityIcon } from "./icons";

const GROUPS: { title: string; keys: AmenityKey[] }[] = [
  { title: "Paths and tracks", keys: ["walking_track", "running_track", "cycling_path", "accessible_paths"] },
  { title: "Play and sport", keys: ["playground", "swings", "slides", "outdoor_gym", "yoga", "basketball", "badminton", "football"] },
  { title: "Comfort", keys: ["benches", "shaded_seating", "drinking_water", "toilets", "pet_friendly"] },
  { title: "Safety and access", keys: ["lighting", "security", "parking"] },
];
const TEXT = { available: "Available", unavailable: "Not available", unverified: "Not verified" } as const;

export default function AmenityGrid({ amenities, compact }: { amenities: Amenities; compact?: boolean }) {
  return (
    <div className="space-y-5">
      {GROUPS.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h3 className="mb-2 text-sm font-semibold text-forest">{g.title}</h3>
          <ul className={`grid gap-x-3 gap-y-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
            {g.keys.map((k) => {
              const s = amenities[k] ?? "unverified";
              return (
                <li key={k} className="flex items-center gap-2">
                  <AmenityIcon k={k} state={s} size={compact ? 22 : 26} />
                  <span className="text-sm leading-tight">
                    {AMENITY_LABELS[k]}
                    <span className={`block text-xs ${s === "available" ? "font-semibold text-forest" : "text-charcoal/70"}`}>{TEXT[s]}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="max-w-prose text-xs text-charcoal/65">
        “Not verified” means nobody has confirmed it either way — not that the facility is missing.
      </p>
    </div>
  );
}
