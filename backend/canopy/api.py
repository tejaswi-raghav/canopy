"""Small FastAPI service for what a static site cannot do: shared reports, moderation, check-in aggregates.

Run:  uvicorn canopy.api:app --reload      (from backend/)
"""
from __future__ import annotations

import os
from datetime import datetime

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .community import AGE_GROUPS, ValidationError, validate_report
from .store import Store

app = FastAPI(title="canopy. API", version="0.1.0", description="Community reports, moderation and k-anonymous check-ins.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.getenv("CANOPY_CORS_ORIGINS", "http://localhost:3000").split(",") if o],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        _store = Store(os.getenv("CANOPY_DB_PATH", ":memory:"), salt=os.getenv("CANOPY_HASH_SALT", "change-me"))
    return _store


class ReportIn(BaseModel):
    parkId: str = Field(max_length=80)
    category: str
    description: str = Field(max_length=2000)
    observedAt: datetime | None = None
    website: str | None = None  # honeypot


class CheckInIn(BaseModel):
    parkId: str = Field(max_length=80)
    ageGroup: str
    hour: int = Field(ge=0, le=23)
    weekend: bool


class ModerateIn(BaseModel):
    status: str


def _caller(request: Request) -> str:
    # The raw address is hashed with a daily-rotating salt and only used for rate limiting.
    fwd = request.headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown"))


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/api/v1/reports", status_code=201)
def create_report(body: ReportIn, request: Request, store: Store = Depends(get_store)):
    try:
        clean = validate_report(body.parkId, body.category, body.description, body.observedAt, body.website)
    except ValidationError as e:
        raise HTTPException(422, str(e))
    h = store.client_hash(_caller(request))
    if not store.allow(h):
        raise HTTPException(429, "Too many reports. Try again in an hour.")
    return store.add_report(clean, h)


@app.get("/api/v1/parks/{park_ref}/reports")
def list_reports(park_ref: str, store: Store = Depends(get_store)):
    return {"reports": store.public_reports(park_ref), "note": "Community observations; not official municipal records."}


@app.post("/api/v1/reports/{report_id}/moderate")
def moderate(report_id: str, body: ModerateIn, authorization: str = Header(default=""), store: Store = Depends(get_store)):
    token = os.getenv("CANOPY_MODERATOR_TOKEN", "")
    if not token or authorization != f"Bearer {token}":
        raise HTTPException(401, "Moderator token required.")
    try:
        ok = store.moderate(report_id, body.status)
    except ValueError as e:
        raise HTTPException(422, str(e))
    if not ok:
        raise HTTPException(404, "Report not found.")
    return {"id": report_id, "status": body.status}


@app.post("/api/v1/checkins", status_code=204)
def check_in(body: CheckInIn, request: Request, store: Store = Depends(get_store)):
    if body.ageGroup not in AGE_GROUPS:
        raise HTTPException(422, "Invalid age group.")
    if not store.allow(store.client_hash("ci:" + _caller(request)), max_per_hour=10):
        raise HTTPException(429, "Too many check-ins.")
    store.add_checkin(body.parkId, body.ageGroup, body.hour, body.weekend)


@app.get("/api/v1/parks/{park_ref}/attendance")
def attendance(park_ref: str, store: Store = Depends(get_store)):
    return store.attendance(park_ref)
