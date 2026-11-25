import { QUALITY_WEIGHTS, MIN_COMPONENTS, MIN_WEIGHT_COVERAGE } from "@/lib/scoring";
import { REC_WEIGHTS } from "@/lib/recommend";
import { DEFAULT_BENCHMARK_M2, CATCHMENT_M } from "@/lib/greenDivide";
import { MIN_OBSERVATIONS } from "@/lib/community";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function Methodology() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 prose-canopy">
      <h1 className="font-display text-5xl font-extrabold text-forest">Methodology</h1>
      <p className="mt-4 text-lg">Every figure on canopy. has a source, a method and a confidence level. This page lists them, with limitations.</p>

      <h2>Data sources and status</h2>
      <table>
        <thead><tr><th>Layer</th><th>Source</th><th>Status in this build</th></tr></thead>
        <tbody>
          <tr><td>Park polygons, facilities, hours</td><td>OpenStreetMap via Overpass</td><td>Live in the browser for any Indian locality</td></tr>
          <tr><td>Search and boundaries</td><td>Nominatim (OpenStreetMap)</td><td>Live. Falls back to a radius when no polygon exists</td></tr>
          <tr><td>Weather, UV, air quality</td><td>Open-Meteo</td><td>Live (US AQI). CPCB adapter planned</td></tr>
          <tr><td>Population</td><td>GHSL / WorldPop / Census</td><td>Needs the backend pipeline; demonstration grid otherwise</td></tr>
          <tr><td>Vegetation and canopy</td><td>Sentinel-2 NDVI, ESA WorldCover</td><td>Needs the backend pipeline; demonstration values otherwise</td></tr>
          <tr><td>Official ward boundaries, municipal park directories, inspections</td><td>Municipal GIS</td><td>Not integrated; adapter interface provided</td></tr>
          <tr><td>Crowd levels and age-group attendance</td><td>Opt-in check-ins</td><td>No data. Nothing is displayed</td></tr>
        </tbody>
      </table>

      <h2>Formulas</h2>
      <ul>
        <li><strong>Public park area per resident</strong> = union of public park polygons clipped to the boundary (m²) ÷ population in the same boundary.</li>
        <li><strong>Vegetation cover</strong> = vegetated area ÷ boundary area × 100. This includes private and agricultural land and is not the same as park area.</li>
        <li><strong>Parks per 10,000 residents</strong> = parks ÷ population × 10,000.</li>
        <li><strong>Walking access</strong>: share of residents whose 250 m grid-cell centre is within 400, 800 or 1,200 m (5, 10, 15 minutes at 4.8 km/h) of a public park edge. Straight-line; routing on the pedestrian network is a planned upgrade.</li>
        <li><strong>Areas</strong> use geodesic polygon area (turf.js), within about 0.3% of the closed-form spherical result in our tests. Overlapping and duplicate polygons are merged before counting.</li>
      </ul>

      <h2>What counts as public</h2>
      <p>Parks, playgrounds and recreation grounds are treated as public unless an access tag says otherwise (OpenStreetMap convention). Gardens and nature reserves are <em>not</em> assumed public. Private, restricted and unconfirmed green space is shown but excluded from public-park figures. Forests, golf courses and private gardens are never counted as parks.</p>

      <h2>Park quality score</h2>
      <p>A transparent weighted score out of 100: maintenance {pct(QUALITY_WEIGHTS.maintenance)}, vegetation and shade {pct(QUALITY_WEIGHTS.vegetation)}, recreational facilities {pct(QUALITY_WEIGHTS.facilities)}, safety infrastructure {pct(QUALITY_WEIGHTS.safety)}, accessibility {pct(QUALITY_WEIGHTS.accessibility)}, comfort {pct(QUALITY_WEIGHTS.comfort)}.</p>
      <ul>
        <li>Each facility is available, unavailable or unverified. Unverified is excluded from the calculation. It never counts as missing.</li>
        <li>Weights are renormalised over components that have evidence. A provisional score needs at least {MIN_COMPONENTS} components covering {pct(MIN_WEIGHT_COVERAGE)} of the weight. Otherwise the page shows “Insufficient data”.</li>
        <li>Confidence is high only with at least 85% evidence and an official inspection.</li>
        <li>The score is computed by Canopy. It is not an official municipal inspection.</li>
        <li>A separate ecological score (NDVI, canopy, dry-season resilience) describes vegetation, not visitor experience.</li>
      </ul>

      <h2>Recommendations</h2>
      <p>Weights: activity {pct(REC_WEIGHTS.activity)}, distance and accessibility {pct(REC_WEIGHTS.distance)}, park quality {pct(REC_WEIGHTS.quality)}, weather and time {pct(REC_WEIGHTS.weather)}, infrastructure {pct(REC_WEIGHTS.infrastructure)}, crowd preference {pct(REC_WEIGHTS.crowd)}. Components with no data are dropped and the rest re-weighted. Parks are excluded only for confirmed reasons (closed at that time, private, beyond the distance limit, confirmed no wheelchair-accessible paths). Unknown opening hours are flagged, not treated as closed. Age groups only suggest activities; they never restrict them.</p>

      <h2>Green Divide</h2>
      <p>For each 250 m cell, a two-step floating catchment area (2SFCA) estimates public park area per resident within {CATCHMENT_M / 1000} km. It is combined with distance to the nearest park, density, nearby park quality and confirmed facilities (weights 35/25/20/10/10). The default benchmark is {DEFAULT_BENCHMARK_M2} m² per resident, often attributed to WHO guidance. Treat it as a reference, since the original source is contested, and adjust it on the page. Suggested sites are indications only and need ownership, environmental and planning feasibility checks.</p>

      <h2>Community data and privacy</h2>
      <ul>
        <li>Reports are validated, sanitised (links, emails and phone numbers removed), rate-limited, de-duplicated and moderated. Photos are re-encoded to remove location metadata.</li>
        <li>Check-ins hold only park, age group and hour. Age-group shares appear only when an hour has at least {MIN_OBSERVATIONS} check-ins.</li>
        <li>No cameras, facial recognition or inferred identities.</li>
      </ul>

      <h2>Known limitations</h2>
      <ul>
        <li>OpenStreetMap completeness varies by city. Few parks have facility or hours tags, so many facilities show “not verified”.</li>
        <li>Demonstration areas are synthetic and do not describe real places.</li>
        <li>The static site cannot run satellite processing or store shared reports. That is the job of the backend in <code>backend/</code>.</li>
        <li>Straight-line distances overstate access where roads, rail or rivers intervene.</li>
        <li>Satellite imagery and 3D buildings need a licensed provider key (see README).</li>
      </ul>
    </div>
  );
}
