# Architecture
```
Browser (static Next.js export on GitHub Pages)
 ├─ Overpass API ─────► parks, amenities, access tags (OSM)
 ├─ Nominatim ────────► boundaries / geocoding
 ├─ Open-Meteo ───────► hourly weather
 ├─ /data/*.json ─────► population, vegetation (optional, from pipeline)
 ├─ turf.js ──────────► area, union/clip, distance, walk catchments, 2SFCA
 └─ localStorage ─────► reports, check-ins (default)
                │ optional NEXT_PUBLIC_REPORTS_ENDPOINT
                ▼
FastAPI (backend/canopy/api.py) ──► SQLite (dev) / PostgreSQL+PostGIS (db/migrations)
Pipeline (backend/scripts/build_area.py): WorldPop/GHSL + WorldCover rasters ──► public/data/*.json
```
There are no Next.js API routes; the site is fully static.
