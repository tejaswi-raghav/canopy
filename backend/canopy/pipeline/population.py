"""Aggregate a population raster (e.g. WorldPop / GHSL) into ~250 m cells inside a boundary.

Output matches public/data/population/<slug>.json read by the web app.
Counts are *modelled estimates*, not a census. Cells are clipped to the boundary by cell-centre.
"""
from __future__ import annotations

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds
from shapely.geometry import shape, mapping


def aggregate_population(raster_path: str, boundary_geojson: dict, source: str, observed_at: str,
                         cell_deg: float | None = None, method_note: str = "") -> dict:
    """boundary_geojson: Polygon/MultiPolygon geometry in EPSG:4326. Raster must be EPSG:4326."""
    geom = shape(boundary_geojson)
    with rasterio.open(raster_path) as src:
        if src.crs is None or src.crs.to_epsg() != 4326:
            raise ValueError("Raster must be in EPSG:4326; reproject first (e.g. gdalwarp -t_srs EPSG:4326).")
        win = from_bounds(*geom.bounds, transform=src.transform).round_offsets().round_lengths()
        data = src.read(1, window=win, masked=True).astype("float64")
        tr = src.window_transform(win)
        inside = geometry_mask([mapping(geom)], out_shape=data.shape, transform=tr, invert=True, all_touched=False)
        valid = inside & ~np.ma.getmaskarray(data) & (data.filled(0) >= 0)
        pop = np.where(valid, data.filled(0), 0.0)
        px_w, px_h = abs(tr.a), abs(tr.e)
        step = max(1, int(round((cell_deg or 0.00225) / px_w)))  # ~250 m at the equator-ish (0.00225 deg)
        cells = []
        rows, cols = pop.shape
        for r0 in range(0, rows, step):
            for c0 in range(0, cols, step):
                block = pop[r0:r0 + step, c0:c0 + step]
                vb = valid[r0:r0 + step, c0:c0 + step]
                if not vb.any():
                    continue
                total = float(block.sum())
                lon, lat = tr @ (c0 + block.shape[1] / 2, r0 + block.shape[0] / 2)
                lat_m = 111_320.0
                lon_m = 111_320.0 * np.cos(np.radians(lat))
                area = float(vb.sum() * px_w * lon_m * px_h * lat_m)
                cells.append({"id": f"{r0}_{c0}", "lon": round(float(lon), 6), "lat": round(float(lat), 6),
                              "population": round(total, 1), "areaM2": round(area, 1)})
    return {
        "total": round(sum(c["population"] for c in cells), 1),
        "cells": cells,
        "source": source,
        "observedAt": observed_at,
        "method": ("Raster summed within the boundary by pixel centre, aggregated to cells. Modelled estimate, not a census. " + method_note).strip(),
    }
