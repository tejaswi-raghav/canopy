# Limitations
- Demo data is synthetic. OSM completeness in India varies; absence of a tag means unknown.
- Walk distances are straight-line. Population is modelled. Vegetation is 10 m land cover, not a survey.
- Population/vegetation/satellite/3D need user-supplied rasters or tile keys.
- Base map uses OSM raster tiles (light use only, per tile policy).
- No shared reports server is deployed. PostGIS schema untested on a live database. STAC/Sentinel download is not implemented; the pipeline takes local rasters.
- Hours parser supports a documented subset of OSM opening_hours.
