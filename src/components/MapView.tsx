"use client";
import { Map as MLMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { bboxOf, walkRing } from "@/lib/geo";
import { MAP_STYLE_URL, SATELLITE_ATTRIBUTION, SATELLITE_TILE_URL, withBase } from "@/lib/base";
import { isPublicPark } from "@/lib/metrics";
import type { DivideCell } from "@/lib/greenDivide";
import type { QualityResult } from "@/lib/scoring";
import type { AreaDataset, LonLat } from "@/lib/types";

export interface LayerState {
  parks: boolean;
  vegetation: boolean;
  quality: boolean;
  population: boolean;
  walk: boolean;
  boundaries: boolean;
  divide: boolean;
  satellite: boolean;
  buildings3d: boolean;
}

let workerSet = false;
function ensureWorker() {
  if (workerSet || typeof window === "undefined") return;
  workerSet = true;
  setWorkerUrl(new URL(withBase("/vendor/maplibre-gl-worker.mjs"), window.location.origin).href);
}

export const CAN_SATELLITE = Boolean(SATELLITE_TILE_URL);
export const CAN_3D = Boolean(MAP_STYLE_URL);

interface Props {
  dataset: AreaDataset;
  qualities: Record<string, QualityResult>;
  layers: LayerState;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  divide?: DivideCell[] | null;
  walkCenter?: LonLat | null;
  className?: string;
  /** padding for fit/fly so UI panels do not cover the subject */
  padding?: { top: number; bottom: number; left: number; right: number };
}

const EMPTY = { type: "FeatureCollection", features: [] } as const;
const prefersReduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function baseStyle(): StyleSpecification | string {
  if (MAP_STYLE_URL) return MAP_STYLE_URL;
  const sources: StyleSpecification["sources"] = {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  };
  const layers: StyleSpecification["layers"] = [
    { id: "bg", type: "background", paint: { "background-color": "#EDEEE3" } },
    { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.5, "raster-opacity": 0.85 } },
  ];
  if (SATELLITE_TILE_URL) {
    sources.sat = { type: "raster", tiles: [SATELLITE_TILE_URL], tileSize: 256, attribution: SATELLITE_ATTRIBUTION || "Imagery provider" };
    layers.push({ id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } });
  }
  return { version: 8, sources, layers };
}

function cellPolygons(cells: DivideCell[]) {
  return {
    type: "FeatureCollection" as const,
    features: cells.map((c) => {
      const half = 125; // 250 m grid
      const dLat = half / 111_320;
      const dLon = half / (111_320 * Math.cos((c.center[1] * Math.PI) / 180));
      const [x, y] = c.center;
      return {
        type: "Feature" as const,
        properties: { index: c.index ?? 0, flagged: c.flagged ? 1 : 0, id: c.id },
        geometry: { type: "Polygon" as const, coordinates: [[[x - dLon, y - dLat], [x + dLon, y - dLat], [x + dLon, y + dLat], [x - dLon, y + dLat], [x - dLon, y - dLat]]] },
      };
    }),
  };
}

export default function MapView({ dataset, qualities, layers, selectedId, onSelect, divide, walkCenter, className, padding }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const readyRef = useRef(false);
  const queue = useRef<(() => void)[]>([]);
  const whenReady = (fn: () => void) => (readyRef.current ? fn() : void queue.current.push(fn));
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const pad = padding ?? { top: 40, bottom: 40, left: 40, right: 40 };
  const padRef = useRef(pad);
  padRef.current = pad;

  const parkFC = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: dataset.parks.map((p) => ({
        type: "Feature" as const,
        properties: {
          id: p.id,
          name: p.name,
          public: isPublicPark(p) ? 1 : 0,
          areaHa: Math.round((p.areaM2 / 1e4) * 10) / 10,
          ndvi: p.vegetation?.ndviMean ?? -1,
          quality: qualities[p.id]?.overall ?? -1,
        },
        geometry: p.geometry.geometry,
      })),
    }),
    [dataset, qualities],
  );
  const popFC = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: (dataset.population?.cells ?? []).map((c) => ({
        type: "Feature" as const,
        properties: { population: c.population },
        geometry: { type: "Point" as const, coordinates: c.center },
      })),
    }),
    [dataset],
  );
  const hoodFC = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [{ type: "Feature" as const, properties: { name: dataset.label }, geometry: dataset.boundary.geometry }, ...(dataset.neighbourhoods ?? []).map((n) => ({ type: "Feature" as const, properties: { name: n.name }, geometry: n.boundary.geometry }))],
    }),
    [dataset],
  );

  // create map once
  useEffect(() => {
    if (!el.current) return;
    ensureWorker();
    const map = new MLMap({
      container: el.current,
      style: baseStyle(),
      center: [78.4867, 17.385],
      zoom: 10,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 8 });

    map.once("style.load", () => {
      const add = (id: string, data: any) => map.addSource(id, { type: "geojson", data });
      add("hoods", EMPTY);
      add("pop", EMPTY);
      add("divide", EMPTY);
      add("parks", EMPTY);
      add("walk", EMPTY);
      add("sel", EMPTY);

      map.addLayer({ id: "divide-fill", type: "fill", source: "divide", layout: { visibility: "none" }, paint: { "fill-color": ["interpolate", ["linear"], ["get", "index"], 30, "#DDE5D3", 55, "#E3C27A", 75, "#C46B3A", 90, "#7E2A1C"], "fill-opacity": 0.7 } });
      map.addLayer({ id: "pop-heat", type: "heatmap", source: "pop", layout: { visibility: "none" }, paint: { "heatmap-weight": ["interpolate", ["linear"], ["get", "population"], 0, 0, 2500, 1], "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 9, 14, 15, 60], "heatmap-intensity": 1, "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(201,162,74,0)", 0.3, "rgba(227,194,122,0.5)", 0.6, "rgba(196,107,58,0.65)", 1, "rgba(126,42,28,0.8)"] } });
      map.addLayer({ id: "parks-fill", type: "fill", source: "parks", paint: { "fill-color": ["case", ["==", ["get", "public"], 1], "#8EAD82", "#B7B5A2"], "fill-opacity": ["case", ["==", ["get", "public"], 1], 0.6, 0.4], "fill-opacity-transition": { duration: 600, delay: 0 } } });
      map.addLayer({ id: "parks-veg", type: "fill", source: "parks", layout: { visibility: "none" }, filter: [">=", ["get", "ndvi"], 0], paint: { "fill-color": ["interpolate", ["linear"], ["get", "ndvi"], 0.15, "#E1E8CF", 0.4, "#8EAD82", 0.65, "#173F35"], "fill-opacity": 0.85 } });
      map.addLayer({ id: "parks-quality", type: "fill", source: "parks", layout: { visibility: "none" }, filter: [">=", ["get", "quality"], 0], paint: { "fill-color": ["interpolate", ["linear"], ["get", "quality"], 20, "#EAD9A8", 55, "#8EAD82", 90, "#173F35"], "fill-opacity": 0.9 } });
      map.addLayer({ id: "parks-line", type: "line", source: "parks", paint: { "line-color": "#173F35", "line-width": 1, "line-opacity": 0.7 } });
      map.addLayer({ id: "walk-fill", type: "fill", source: "walk", layout: { visibility: "none" }, paint: { "fill-color": "#173F35", "fill-opacity": ["interpolate", ["linear"], ["get", "minutes"], 5, 0.22, 10, 0.14, 15, 0.08] } });
      map.addLayer({ id: "walk-line", type: "line", source: "walk", layout: { visibility: "none" }, paint: { "line-color": "#173F35", "line-width": 1.2, "line-dasharray": [2, 2] } });
      map.addLayer({ id: "hoods-line", type: "line", source: "hoods", paint: { "line-color": "#202620", "line-width": 1.2, "line-dasharray": [3, 2], "line-opacity": 0.6 } });
      map.addLayer({ id: "sel-fill", type: "fill", source: "sel", paint: { "fill-color": "#173F35", "fill-opacity": 0.18 } });
      map.addLayer({ id: "sel-line", type: "line", source: "sel", paint: { "line-color": "#173F35", "line-width": 3 } });

      if (MAP_STYLE_URL) {
        const bld = map.getStyle().layers.find((l: any) => l["source-layer"] === "building" && "source" in l);
        if (bld && "source" in bld) {
          map.addLayer({ id: "bld3d", type: "fill-extrusion", source: bld.source as string, "source-layer": "building", layout: { visibility: "none" }, paint: { "fill-extrusion-color": "#C9CCC0", "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 8], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": 0.8 } } as any, "parks-fill");
        }
      }

      map.on("mousemove", "parks-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        map.getCanvas().style.cursor = "pointer";
        const div = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = String(f.properties?.name ?? "Park");
        const sub = document.createElement("div");
        const q = Number(f.properties?.quality);
        sub.textContent = `${f.properties?.areaHa} ha · ${f.properties?.public === 1 ? "public" : "access not confirmed"}${q >= 0 ? ` · quality ${q}/100` : ""}`;
        div.append(strong, sub);
        popup.setLngLat(e.lngLat).setDOMContent(div).addTo(map);
      });
      map.on("mouseleave", "parks-fill", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("click", (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ["parks-fill"] })[0];
        selectRef.current(f ? String(f.properties?.id) : null);
      });

      readyRef.current = true;
      queue.current.splice(0).forEach((f) => f());
    });

    return () => {
      readyRef.current = false;
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // push data
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      (map.getSource("parks") as GeoJSONSource).setData(parkFC as any);
      (map.getSource("pop") as GeoJSONSource).setData(popFC as any);
      (map.getSource("hoods") as GeoJSONSource).setData(hoodFC as any);
      const [w, s, e, n] = bboxOf(dataset.boundary);
      map.fitBounds([[w, s], [e, n]], { padding: padRef.current, duration: prefersReduced() ? 0 : 1600, maxZoom: 16 });
    };
    whenReady(apply);
  }, [dataset, parkFC, popFC, hoodFC]);

  // divide cells
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => (map.getSource("divide") as GeoJSONSource).setData((divide ? cellPolygons(divide) : EMPTY) as any);
    whenReady(apply);
  }, [divide]);

  // layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      vis("parks-fill", layers.parks);
      vis("parks-line", layers.parks);
      vis("parks-veg", layers.vegetation);
      vis("parks-quality", layers.quality);
      vis("pop-heat", layers.population);
      vis("divide-fill", layers.divide);
      vis("hoods-line", layers.boundaries);
      vis("walk-fill", layers.walk);
      vis("walk-line", layers.walk);
      vis("sat", layers.satellite && CAN_SATELLITE);
      vis("bld3d", layers.buildings3d && CAN_3D);
      if (CAN_3D) map.easeTo({ pitch: layers.buildings3d ? 55 : 0, duration: prefersReduced() ? 0 : 900 });
    };
    whenReady(apply);
  }, [layers]);

  // selection highlight + fly
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const p = dataset.parks.find((x) => x.id === selectedId);
      (map.getSource("sel") as GeoJSONSource).setData((p ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: p.geometry.geometry }] } : EMPTY) as any);
      if (p) {
        const [w, s, e, n] = bboxOf(p.geometry);
        map.fitBounds([[w, s], [e, n]], { padding: { top: 80, bottom: 80, left: Math.max(80, padRef.current.left), right: Math.max(80, padRef.current.right) }, duration: prefersReduced() ? 0 : 1200, maxZoom: 17.5 });
      }
    };
    whenReady(apply);
  }, [selectedId, dataset]);

  // animated walking rings
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const apply = () => {
      const src = map.getSource("walk") as GeoJSONSource;
      if (!walkCenter || !layers.walk) return src.setData(EMPTY as any);
      const rings = [15, 10, 5].map((m) => ({ ...walkRing(walkCenter, m), properties: { minutes: m } }));
      if (prefersReduced()) return src.setData({ type: "FeatureCollection", features: rings } as any);
      src.setData(EMPTY as any);
      rings.forEach((r, i) => timers.push(setTimeout(() => src.setData({ type: "FeatureCollection", features: rings.slice(0, i + 1) } as any), 250 * (i + 1))));
    };
    whenReady(apply);
    return () => timers.forEach(clearTimeout);
  }, [walkCenter, layers.walk]);

  return <div ref={el} className={className} role="application" aria-label="Interactive map of green spaces" />;
}
