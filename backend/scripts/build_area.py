#!/usr/bin/env python3
"""Build population + vegetation JSON for one area.

  python scripts/build_area.py --slug hyderabad --boundary boundary.geojson \
      --population worldpop_ind_2020_4326.tif --population-source "WorldPop 2020 (constrained, 100 m)" \
      --landcover worldcover_4326.tif --landcover-source "ESA WorldCover 2021 v200" --date 2021-01-01 --out ../public/data

Rasters must be EPSG:4326 and downloaded by you (this script does no network access).
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from canopy.pipeline.population import aggregate_population
from canopy.pipeline.vegetation import zonal_vegetation


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--slug", required=True)
    p.add_argument("--boundary", required=True, help="GeoJSON Polygon/MultiPolygon/Feature in EPSG:4326")
    p.add_argument("--population"); p.add_argument("--population-source", default="")
    p.add_argument("--landcover"); p.add_argument("--landcover-source", default="")
    p.add_argument("--date", required=True, help="observation date/year of the rasters")
    p.add_argument("--out", default="../public/data")
    a = p.parse_args()
    g = json.load(open(a.boundary))
    g = g.get("geometry", g) if g.get("type") == "Feature" else g
    if a.population:
        d = aggregate_population(a.population, g, a.population_source, a.date)
        os.makedirs(f"{a.out}/population", exist_ok=True)
        json.dump(d, open(f"{a.out}/population/{a.slug}.json", "w"))
        print("population cells:", len(d["cells"]), "total:", d["total"])
    if a.landcover:
        d = zonal_vegetation(a.landcover, g, a.landcover_source, a.date)
        os.makedirs(f"{a.out}/vegetation", exist_ok=True)
        json.dump(d, open(f"{a.out}/vegetation/{a.slug}.json", "w"))
        print("vegetation:", d["vegetatedAreaM2"], "m2, canopy", d["canopyPct"], "%")

main()
