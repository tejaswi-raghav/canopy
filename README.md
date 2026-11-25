# canopy.

Green-space intelligence and park discovery for Indian cities. Pilot city: Hyderabad.
Discover parks, understand how green and how equitably served a neighbourhood is, and get a plan for when and where to go.

## Read this first: what is real and what is not
- **Demonstration data is synthetic.** The built-in Hyderabad dataset (parks named "Demo Park …", populations, vegetation) is generated and always labelled. It exists so every feature can be exercised offline.
- **Live data** (browser, no server): parks from OpenStreetMap via Overpass, boundaries via Nominatim, weather via Open-Meteo. Missing OSM tags are shown as *unverified*, never as "absent".
- **Population and vegetation** are shown only after you run the pipeline (`backend/scripts/build_area.py`) on rasters you download (WorldPop/GHSL, ESA WorldCover). Until then they show "unavailable".
- **Satellite and 3D** appear only if you set the provider env vars. No key is bundled.
- **Quality scores are not official inspections.** Community reports are observations, not municipal records.
- Reports and check-ins are stored in the visitor's browser unless you deploy `backend/` and set `NEXT_PUBLIC_REPORTS_ENDPOINT`.
- `db/migrations/001_init.sql` (PostGIS) is syntax-checked only; it has not been run against a live PostGIS. The FastAPI service uses SQLite by default.

## Run locally
```bash
npm ci
npm run dev            # http://localhost:3000
npm test               # unit tests (vitest)
npm run build          # static export to out/
PW_CHANNEL=chrome npm run e2e   # Playwright (needs a browser)
```
Backend:
```bash
cd backend && python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
pytest
uvicorn canopy.api:app --reload
python scripts/build_area.py --help
```

## Deploy to GitHub Pages
```bash
git init -b main && git add . && git commit -m "canopy."
gh repo create canopy-app --public --source=. --push     # or add a remote and push manually
```
Then in the repo: **Settings → Pages → Source: GitHub Actions**. The workflow in `.github/workflows/pages.yml` builds with `NEXT_PUBLIC_BASE_PATH=/<repo-name>` and publishes `out/`. Site: `https://<user>.github.io/canopy-app/`. Optional env values go in **Settings → Variables → Actions**.

## Docs
`docs/architecture.md`, `docs/methodology.md`, `docs/limitations.md`, `docs/test-results.md`; the in-app `/methodology` page explains each formula.
