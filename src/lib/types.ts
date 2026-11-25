import type { Feature, MultiPolygon, Polygon } from "geojson";

export type Poly = Feature<Polygon | MultiPolygon, Record<string, unknown>>;
export type LonLat = [number, number];

export type Confidence = "high" | "medium" | "low" | "n/a";

/** Where a number came from and how much to trust it. Shown next to every metric. */
export interface Provenance {
  source: string;
  observedAt: string | null;
  method: string;
  confidence: Confidence;
  /** true when the value comes from the built-in demonstration dataset */
  demo?: boolean;
}

/** A metric that may legitimately be unavailable. Never invent a value. */
export interface Metric {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  provenance: Provenance;
  /** why the value is null, or an extra caveat */
  note?: string;
}

export const AMENITY_KEYS = [
  "walking_track",
  "running_track",
  "cycling_path",
  "outdoor_gym",
  "swings",
  "slides",
  "playground",
  "basketball",
  "badminton",
  "football",
  "yoga",
  "benches",
  "drinking_water",
  "toilets",
  "accessible_paths",
  "lighting",
  "parking",
  "shaded_seating",
  "security",
  "pet_friendly",
] as const;
export type AmenityKey = (typeof AMENITY_KEYS)[number];

export const AMENITY_LABELS: Record<AmenityKey, string> = {
  walking_track: "Walking track",
  running_track: "Running track",
  cycling_path: "Cycling path",
  outdoor_gym: "Outdoor gym",
  swings: "Swings",
  slides: "Slides",
  playground: "Children's playground",
  basketball: "Basketball court",
  badminton: "Badminton court",
  football: "Football ground",
  yoga: "Yoga area",
  benches: "Benches",
  drinking_water: "Drinking water",
  toilets: "Public toilets",
  accessible_paths: "Wheelchair-accessible paths",
  lighting: "Lighting",
  parking: "Parking",
  shaded_seating: "Shaded seating",
  security: "Security",
  pet_friendly: "Pet-friendly area",
};

/** Missing data must never be read as "does not exist": that is `unverified`. */
export type AmenityState = "available" | "unavailable" | "unverified";
export type Amenities = Partial<Record<AmenityKey, AmenityState>>;

export type ParkKind = "park" | "garden" | "playground" | "recreation_ground" | "nature_reserve" | "other_green";
export type AccessKind = "public" | "restricted" | "private" | "unknown";

export interface OpeningHours {
  /** minutes-from-midnight [open, close) ranges, indexed 0=Sunday … 6=Saturday, India Standard Time */
  ranges: Record<number, [number, number][]>;
  raw: string | null;
  verified: boolean;
  source: string;
}

export interface VegetationStats {
  /** mean NDVI 0..1 inside the park polygon */
  ndviMean: number | null;
  /** tree canopy cover, percent of park area */
  canopyPct: number | null;
  /** lowest seasonal mean NDVI (dry-season), 0..1 */
  ndviSeasonMin: number | null;
  observedAt: string | null;
  source: string;
}

/** Evidence-based sub-assessments (0..100). null means no evidence. */
export interface ParkAssessment {
  maintenance: number | null;
  cleanliness: number | null;
  /** who produced it */
  kind: "official_inspection" | "community" | "none";
  assessedAt: string | null;
  source: string | null;
}

export interface Park {
  id: string;
  name: string;
  kind: ParkKind;
  access: AccessKind;
  geometry: Poly;
  centroid: LonLat;
  areaM2: number;
  hours: OpeningHours | null;
  feeInr: number | null;
  authority: string | null;
  amenities: Amenities;
  vegetation: VegetationStats | null;
  assessment: ParkAssessment;
  neighbourhoodId?: string;
  provenance: Provenance;
  /** OSM ref like way/123 when applicable */
  osmRef?: string;
}

export interface PopulationCell {
  id: string;
  center: LonLat;
  population: number;
  /** cell area in square metres */
  areaM2: number;
}

export interface Neighbourhood {
  id: string;
  name: string;
  city: string;
  boundary: Poly;
  /** true if the boundary is not an official polygon */
  boundaryIsApproximate: boolean;
}

export interface AreaDataset {
  slug: string;
  label: string;
  mode: "demo" | "live";
  boundary: Poly;
  boundaryProvenance: Provenance;
  parks: Park[];
  /** null → population unavailable; metrics that need it become honest "unavailable" */
  population: { total: number; cells: PopulationCell[] | null; provenance: Provenance } | null;
  vegetation: { vegetatedAreaM2: number; canopyPct: number | null; provenance: Provenance } | null;
  /** OSM landuse/natural green land that is not necessarily publicly accessible (m²) */
  mappedGreenLandM2?: number | null;
  neighbourhoods?: Neighbourhood[];
  warnings: string[];
}

export type AgeGroup = "5-12" | "13-17" | "18-25" | "26-45" | "46-59" | "60+";
export const AGE_GROUPS: { id: AgeGroup; label: string }[] = [
  { id: "5-12", label: "Children 5–12" },
  { id: "13-17", label: "Teenagers 13–17" },
  { id: "18-25", label: "Young adults 18–25" },
  { id: "26-45", label: "Adults 26–45" },
  { id: "46-59", label: "Middle-aged 46–59" },
  { id: "60+", label: "Senior citizens 60+" },
];

export type ActivityKey =
  | "walking"
  | "jogging"
  | "cycling"
  | "yoga"
  | "outdoor_gym"
  | "playground"
  | "basketball"
  | "badminton"
  | "football"
  | "relax"
  | "reading"
  | "socialise"
  | "photography"
  | "picnic";

export interface HourWeather {
  hour: number; // 0..23 IST
  tempC: number | null;
  rainProb: number | null; // percent
  aqi: number | null; // US AQI or national AQI, see source
  uv: number | null;
  isDaylight: boolean | null;
}
