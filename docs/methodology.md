# Methodology (summary)
- **Green space per capita** = union of public park polygons clipped to the boundary ÷ modelled population. Benchmark 9 m² (a widely cited WHO-attributed guideline whose provenance is disputed; shown as a reference, not a legal standard).
- **Walk access** uses straight-line 80 m/min rings (400/800/1200 m), approximate; no street network.
- **Park Quality Score** weights 25/20/20/15/10/10, renormalised over components with evidence; needs ≥2 components and ≥45% weight coverage, else "Insufficient data". Unverified amenities are excluded, never counted as absent.
- **Recommendations** weights 25/20/20/15/10/10; unknown hours are flagged, not treated as closed.
- **Green Divide** uses 2SFCA with a 1 km catchment; index weights 35/25/20/10/10.
- **Check-ins** are released only for bins with ≥20 observations (k-anonymity).
- **Reports**: sanitised, honeypot, 5/hour limit, duplicate detection; pending → corroborated (3 independent) → verified (moderator only).
Full detail: the `/methodology` page.
