-- canopy. — PostgreSQL 15+ / PostGIS 3.3+
-- Geometries are stored in EPSG:4326. Areas are computed on geography (geodesic) or an
-- equal-area projection; never on raw degrees.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE data_provenance (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,
  license       TEXT,
  url           TEXT,
  method        TEXT NOT NULL,
  observed_at   DATE,
  retrieved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  confidence    TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('high','medium','low')),
  is_demo       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE cities (
  id            SERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  state         TEXT,
  boundary      geometry(MultiPolygon, 4326),
  provenance_id BIGINT REFERENCES data_provenance(id)
);

CREATE TABLE neighbourhoods (
  id            SERIAL PRIMARY KEY,
  city_id       INT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  name          TEXT NOT NULL,
  boundary      geometry(MultiPolygon, 4326) NOT NULL,
  boundary_is_official BOOLEAN NOT NULL DEFAULT FALSE,
  provenance_id BIGINT REFERENCES data_provenance(id),
  UNIQUE (city_id, slug)
);
CREATE INDEX neighbourhoods_gix ON neighbourhoods USING GIST (boundary);

CREATE TYPE park_kind   AS ENUM ('park','garden','playground','recreation_ground','nature_reserve','other_green');
CREATE TYPE access_kind AS ENUM ('public','restricted','private','unknown');

CREATE TABLE parks (
  id            BIGSERIAL PRIMARY KEY,
  osm_ref       TEXT UNIQUE,
  name          TEXT NOT NULL,
  kind          park_kind NOT NULL,
  access        access_kind NOT NULL DEFAULT 'unknown',
  neighbourhood_id INT REFERENCES neighbourhoods(id),
  authority     TEXT,
  entry_fee_inr NUMERIC(8,2),
  last_inspection_on DATE,
  provenance_id BIGINT REFERENCES data_provenance(id),
  merged_from   BIGINT[] NOT NULL DEFAULT '{}'
);

-- One row per component polygon; the dedup pipeline unions fragments into parks.geometry_union.
CREATE TABLE park_geometries (
  id        BIGSERIAL PRIMARY KEY,
  park_id   BIGINT NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  geom      geometry(MultiPolygon, 4326) NOT NULL,
  is_valid  BOOLEAN GENERATED ALWAYS AS (ST_IsValid(geom)) STORED,
  area_m2   DOUBLE PRECISION GENERATED ALWAYS AS (ST_Area(geom::geography)) STORED
);
CREATE INDEX park_geometries_gix ON park_geometries USING GIST (geom);

CREATE MATERIALIZED VIEW park_geometry_union AS
  SELECT park_id,
         ST_Multi(ST_UnionAggr(ST_MakeValid(geom)))::geometry(MultiPolygon,4326) AS geom,
         ST_Area(ST_UnionAggr(ST_MakeValid(geom))::geography) AS area_m2
  FROM park_geometries GROUP BY park_id;
CREATE UNIQUE INDEX park_geometry_union_pk  ON park_geometry_union (park_id);
CREATE INDEX        park_geometry_union_gix ON park_geometry_union USING GIST (geom);

CREATE TYPE amenity_key AS ENUM (
  'walking_track','running_track','cycling_path','outdoor_gym','swings','slides','playground',
  'basketball','badminton','football','yoga','benches','drinking_water','toilets',
  'accessible_paths','lighting','parking','shaded_seating','security','pet_friendly');
-- A missing row means "unverified". 'unavailable' must be an explicit observation.
CREATE TABLE amenities (
  park_id       BIGINT NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  amenity       amenity_key NOT NULL,
  state         TEXT NOT NULL CHECK (state IN ('available','unavailable')),
  verified_on   DATE,
  provenance_id BIGINT REFERENCES data_provenance(id),
  PRIMARY KEY (park_id, amenity)
);

CREATE TABLE opening_hours (
  park_id    BIGINT NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  dow        SMALLINT NOT NULL CHECK (dow BETWEEN 0 AND 6),  -- 0 = Sunday, India Standard Time
  opens      TIME NOT NULL,
  closes     TIME NOT NULL,
  raw        TEXT,
  verified   BOOLEAN NOT NULL DEFAULT FALSE,
  provenance_id BIGINT REFERENCES data_provenance(id),
  PRIMARY KEY (park_id, dow, opens)
);

-- 250 m grid of residents. `cell` is in EPSG:4326 for joins; area is computed geodesically.
CREATE TABLE population_estimates (
  id            BIGSERIAL PRIMARY KEY,
  city_id       INT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  cell          geometry(Polygon, 4326) NOT NULL,
  population    DOUBLE PRECISION NOT NULL CHECK (population >= 0),
  reference_year SMALLINT NOT NULL,
  provenance_id BIGINT NOT NULL REFERENCES data_provenance(id)
);
CREATE INDEX population_estimates_gix ON population_estimates USING GIST (cell);

CREATE TABLE vegetation_measurements (
  id            BIGSERIAL PRIMARY KEY,
  park_id       BIGINT REFERENCES parks(id) ON DELETE CASCADE,
  neighbourhood_id INT REFERENCES neighbourhoods(id) ON DELETE CASCADE,
  ndvi_mean     REAL CHECK (ndvi_mean BETWEEN -1 AND 1),
  ndvi_season_min REAL CHECK (ndvi_season_min BETWEEN -1 AND 1),
  canopy_pct    REAL CHECK (canopy_pct BETWEEN 0 AND 100),
  vegetated_area_m2 DOUBLE PRECISION,
  observed_on   DATE NOT NULL,
  provenance_id BIGINT NOT NULL REFERENCES data_provenance(id),
  CHECK (park_id IS NOT NULL OR neighbourhood_id IS NOT NULL)
);

CREATE TABLE quality_assessments (
  id            BIGSERIAL PRIMARY KEY,
  park_id       BIGINT NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('official_inspection','community','derived')),
  maintenance   SMALLINT CHECK (maintenance BETWEEN 0 AND 100),
  cleanliness   SMALLINT CHECK (cleanliness BETWEEN 0 AND 100),
  overall       SMALLINT CHECK (overall BETWEEN 0 AND 100),
  completeness  REAL CHECK (completeness BETWEEN 0 AND 1),
  confidence    TEXT CHECK (confidence IN ('high','medium','low')),
  assessed_on   DATE NOT NULL,
  provenance_id BIGINT REFERENCES data_provenance(id)
);

CREATE TYPE report_status AS ENUM ('pending','corroborated','verified','rejected','duplicate');
CREATE TABLE community_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  park_id       BIGINT REFERENCES parks(id) ON DELETE SET NULL,
  park_ref      TEXT,                       -- when the park is not yet in `parks`
  category      TEXT NOT NULL,
  description   TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 500),
  observed_at   TIMESTAMPTZ NOT NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        report_status NOT NULL DEFAULT 'pending',
  duplicate_of  UUID REFERENCES community_reports(id),
  photo_key     TEXT,                       -- object-storage key of the EXIF-stripped image
  client_hash   TEXT NOT NULL,              -- salted, rotating hash for rate limiting; never an IP or account
  moderated_by  TEXT,
  moderated_at  TIMESTAMPTZ
);
CREATE INDEX community_reports_park_idx ON community_reports (park_id, category, observed_at);

-- No user identifier, no exact timestamp: only (park, age group, hour, day type).
CREATE TABLE attendance_observations (
  id        BIGSERIAL PRIMARY KEY,
  park_id   BIGINT NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  age_group TEXT NOT NULL CHECK (age_group IN ('5-12','13-17','18-25','26-45','46-59','60+')),
  hour_ist  SMALLINT NOT NULL CHECK (hour_ist BETWEEN 0 AND 23),
  weekend   BOOLEAN NOT NULL
);

-- Public view releases an age-group share only when the (park, hour, daytype) bin has >= 20 observations.
CREATE VIEW attendance_public AS
WITH bins AS (
  SELECT park_id, hour_ist, weekend, count(*) AS n
  FROM attendance_observations GROUP BY park_id, hour_ist, weekend HAVING count(*) >= 20)
SELECT o.park_id, o.hour_ist, o.weekend, o.age_group,
       count(*)::float / b.n AS share, count(*) AS n
FROM attendance_observations o
JOIN bins b USING (park_id, hour_ist, weekend)
GROUP BY o.park_id, o.hour_ist, o.weekend, o.age_group, b.n;

-- Area metrics with no double counting: public parks are unioned and clipped to the boundary
-- before measuring, and population uses the same boundary.
CREATE OR REPLACE FUNCTION canopy_area_metrics(boundary geometry)
RETURNS TABLE (
  boundary_area_m2 DOUBLE PRECISION,
  public_park_area_m2 DOUBLE PRECISION,
  public_park_count BIGINT,
  population DOUBLE PRECISION,
  public_park_m2_per_resident DOUBLE PRECISION
) LANGUAGE sql STABLE AS $$
  WITH b AS (SELECT ST_MakeValid(boundary) AS g),
  pub AS (
    SELECT u.park_id, ST_Intersection(u.geom, b.g) AS g
    FROM park_geometry_union u
    JOIN parks p ON p.id = u.park_id AND p.access = 'public'
                 AND p.kind IN ('park','garden','playground','recreation_ground')
    JOIN b ON ST_Intersects(u.geom, b.g)
  ),
  area AS (SELECT ST_Area(ST_UnionAggr(g)::geography) AS a, count(*) AS n FROM pub),
  pop AS (
    SELECT coalesce(sum(e.population * ST_Area(ST_Intersection(e.cell, b.g)::geography)
                        / NULLIF(ST_Area(e.cell::geography), 0)), 0) AS p
    FROM population_estimates e JOIN b ON ST_Intersects(e.cell, b.g)
  )
  SELECT ST_Area(b.g::geography), coalesce(area.a, 0), area.n, pop.p,
         CASE WHEN pop.p > 0 THEN coalesce(area.a, 0) / pop.p END
  FROM b, area, pop;
$$;
