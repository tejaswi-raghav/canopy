# Test results (run 2026-11-25, local)
- TypeScript `tsc --noEmit`: clean
- vitest: 62 tests passing (geometry, hours/sun, scoring, recommendation, data integrity, community)
- pytest (backend): 13 passing (sanitising, validation, duplicates, k-anonymity, rate limit, API, raster pipeline on synthetic rasters)
- Playwright (Chrome, external network blocked): 10 passing, incl. axe wcag2a/2aa serious/critical checks
- Static build: succeeds with and without `NEXT_PUBLIC_BASE_PATH`
Not tested: live Overpass/Nominatim/Open-Meteo calls from CI, PostGIS migration on a real database, real WorldPop/WorldCover rasters.
