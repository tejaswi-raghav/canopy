import os, sys
from datetime import datetime, timedelta, timezone
import numpy as np, pytest, rasterio
from rasterio.transform import from_origin
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from canopy import api
from canopy.community import ValidationError, sanitise_text, validate_report, jaccard
from canopy.store import Store
from canopy.pipeline.population import aggregate_population
from canopy.pipeline.vegetation import ndvi, zonal_vegetation

BOX = {"type": "Polygon", "coordinates": [[[78.0, 17.0], [78.02, 17.0], [78.02, 17.02], [78.0, 17.02], [78.0, 17.0]]]}


def raster(tmp_path, arr, name, dtype):
    p = str(tmp_path / name)
    h, w = arr.shape
    with rasterio.open(p, "w", driver="GTiff", height=h, width=w, count=1, dtype=dtype, crs="EPSG:4326",
                       transform=from_origin(78.0, 17.02, 0.02 / w, 0.02 / h), nodata=-1 if dtype.startswith("float") else 0) as d:
        d.write(arr.astype(dtype), 1)
    return p


def test_sanitise_strips_pii():
    s = sanitise_text("call 9876543210 or mail a@b.com <b>now</b> http://x.y/z")
    assert "9876543210" not in s and "@" not in s and "<b>" not in s and "http" not in s


def test_validation_rules():
    with pytest.raises(ValidationError): validate_report("p", "litter", "short", None)
    with pytest.raises(ValidationError): validate_report("p", "nope", "long enough text here", None)
    with pytest.raises(ValidationError): validate_report("p", "litter", "long enough text here", None, honeypot="x")
    with pytest.raises(ValidationError): validate_report("p", "litter", "long enough text here", datetime.now(timezone.utc) + timedelta(days=2))
    assert validate_report("p", "litter", "plenty of litter near gate", None).category == "litter"


def test_duplicate_and_corroboration():
    s = Store()
    mk = lambda t: validate_report("p1", "litter", t, None)
    first = s.add_report(mk("lots of litter near the main gate"), "a")
    assert first["status"] == "pending"
    s.add_report(mk("lots of litter near main gate area"), "b")
    assert s.public_reports("p1") == []
    r3 = s.add_report(mk("litter near the main gate lots"), "c")
    assert r3["status"] == "duplicate"
    pub = s.public_reports("p1")
    assert len(pub) == 1 and pub[0]["status"] == "corroborated" and pub[0]["official"] is False
    assert "client_hash" not in pub[0]


def test_only_moderator_verifies():
    s = Store()
    r = s.add_report(validate_report("p", "litter", "overflowing bins by the lake", None), "a")
    with pytest.raises(ValueError): s.moderate(r["id"], "corroborated")
    assert s.moderate(r["id"], "verified")


def test_rate_limit():
    s = Store()
    assert all(s.allow("h", 5, now=1000 + i) for i in range(5))
    assert not s.allow("h", 5, now=1010)
    assert s.allow("h", 5, now=1000 + 3700)


def test_k_anonymity():
    s = Store()
    for _ in range(19): s.add_checkin("p", "18-25", 7, False)
    assert s.attendance("p")["released"] == [] and s.attendance("p")["suppressed_bins"] == 1
    s.add_checkin("p", "26-45", 7, False)
    out = s.attendance("p")
    assert len(out["released"]) == 2 and abs(sum(x["share"] for x in out["released"]) - 1) < 1e-9


def client():
    api._store = Store()
    os.environ["CANOPY_MODERATOR_TOKEN"] = "tok"
    return TestClient(api.app)


def test_api_flow():
    c = client()
    assert c.get("/health").json() == {"ok": True}
    body = {"parkId": "p9", "category": "litter", "description": "bins overflowing at east entrance"}
    assert c.post("/api/v1/reports", json=body).status_code == 201
    assert c.post("/api/v1/reports", json={**body, "description": "x"}).status_code == 422
    assert c.post("/api/v1/reports", json={**body, "website": "spam"}).status_code == 422
    rid = c.post("/api/v1/reports", json={**body, "category": "litter", "parkId": "p10"}).json()["id"]
    assert c.post(f"/api/v1/reports/{rid}/moderate", json={"status": "verified"}).status_code == 401
    assert c.post(f"/api/v1/reports/{rid}/moderate", json={"status": "verified"}, headers={"Authorization": "Bearer tok"}).status_code == 200
    assert len(c.get("/api/v1/parks/p10/reports").json()["reports"]) == 1
    assert c.post("/api/v1/checkins", json={"parkId": "p", "ageGroup": "bad", "hour": 7, "weekend": False}).status_code == 422


def test_api_rate_limit_429():
    c = client()
    body = {"parkId": "px", "category": "litter", "description": "unique text number %d about gate"}
    codes = [c.post("/api/v1/reports", json={**body, "description": f"unique words {i} alpha{i} beta{i} gamma{i}"}).status_code for i in range(7)]
    assert codes[:5] == [201] * 5 and codes[5] == 429


def test_population_sum_preserved(tmp_path):
    arr = np.ones((40, 40)) * 2.0
    p = raster(tmp_path, arr, "pop.tif", "float32")
    out = aggregate_population(p, BOX, "test", "2020")
    assert out["total"] == pytest.approx(3200, rel=0.02)
    assert all(c["areaM2"] > 0 for c in out["cells"])


def test_population_excludes_outside_and_nodata(tmp_path):
    arr = np.ones((40, 40)); arr[:20, :] = -1
    p = raster(tmp_path, arr, "pop2.tif", "float32")
    out = aggregate_population(p, BOX, "t", "2020")
    assert out["total"] == pytest.approx(800, rel=0.03)


def test_vegetation_classes(tmp_path):
    arr = np.zeros((40, 40), dtype="uint8"); arr[:] = 50
    arr[:10, :] = 10; arr[10:20, :] = 30; arr[20:30, :] = 40  # tree, grass, cropland
    p = raster(tmp_path, arr, "lc.tif", "uint8")
    out = zonal_vegetation(p, BOX, "t", "2021")
    assert out["canopyPct"] == pytest.approx(25, abs=1.5)
    total = out["vegetatedAreaM2"] / 0.5  # tree+grass = half the area
    assert total > 0 and out["vegetatedAreaM2"] / (out["vegetatedAreaM2"] / (out["canopyPct"] / 50)) == pytest.approx(0.5, abs=0.05)


def test_ndvi():
    r = ndvi(np.array([8.0, 0.0]), np.array([2.0, 0.0]))
    assert r[0] == pytest.approx(0.6) and np.isnan(r[1])


def test_wrong_crs_rejected(tmp_path):
    p = str(tmp_path / "bad.tif")
    with rasterio.open(p, "w", driver="GTiff", height=4, width=4, count=1, dtype="float32", crs="EPSG:3857", transform=from_origin(0, 0, 1, 1)) as d:
        d.write(np.ones((4, 4), dtype="float32"), 1)
    with pytest.raises(ValueError): aggregate_population(p, BOX, "t", "2020")
