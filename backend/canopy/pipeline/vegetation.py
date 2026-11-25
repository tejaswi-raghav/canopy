"""Vegetation statistics from a land-cover raster (ESA WorldCover classes) and NDVI helper.

WorldCover classes counted as green space: 10 tree cover, 20 shrubland, 30 grassland, 95 mangroves.
Excluded and documented: 40 cropland (agriculture is not public green space), 90 herbaceous wetland.
"""
from __future__ import annotations

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds
from shapely.geometry import shape, mapping

GREEN_CLASSES = (10, 20, 30, 95)
TREE_CLASS = 10


def ndvi(nir: np.ndarray, red: np.ndarray) -> np.ndarray:
    """NDVI = (NIR - Red) / (NIR + Red); NaN where the denominator is zero. Sentinel-2: B08, B04."""
    nir = nir.astype("float64")
    red = red.astype("float64")
    den = nir + red
    with np.errstate(divide="ignore", invalid="ignore"):
        out = np.where(den == 0, np.nan, (nir - red) / den)
    return out


def zonal_vegetation(raster_path: str, boundary_geojson: dict, source: str, observed_at: str, pixel_area_m2: float | None = None) -> dict:
    geom = shape(boundary_geojson)
    with rasterio.open(raster_path) as src:
        if src.crs is None or src.crs.to_epsg() != 4326:
            raise ValueError("Raster must be in EPSG:4326.")
        win = from_bounds(*geom.bounds, transform=src.transform).round_offsets().round_lengths()
        data = src.read(1, window=win)
        tr = src.window_transform(win)
        inside = geometry_mask([mapping(geom)], out_shape=data.shape, transform=tr, invert=True)
        nodata = src.nodata
        valid = inside & (data != nodata if nodata is not None else True)
        if not valid.any():
            raise ValueError("No valid pixels inside the boundary.")
        # per-row pixel area (varies with latitude)
        rows = np.arange(data.shape[0])
        lats = tr.f + (rows + 0.5) * tr.e
        px_area = abs(tr.a) * 111_320.0 * np.cos(np.radians(lats)) * abs(tr.e) * 111_320.0
        if pixel_area_m2:
            px_area = np.full_like(px_area, pixel_area_m2)
        A = px_area[:, None] * np.ones_like(data, dtype="float64")
        total = float((A * valid).sum())
        green = float((A * (valid & np.isin(data, GREEN_CLASSES))).sum())
        tree = float((A * (valid & (data == TREE_CLASS))).sum())
    return {
        "vegetatedAreaM2": round(green, 1),
        "canopyPct": round(100 * tree / total, 2) if total else None,
        "source": source,
        "observedAt": observed_at,
        "method": "Land-cover classes tree/shrub/grass/mangrove counted as vegetated; cropland excluded. Canopy = tree-cover class share of area. 10 m classification, not a field survey.",
    }
