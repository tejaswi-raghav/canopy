"""Community-report rules. Mirrors src/lib/community.ts so browser and server agree."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

CATEGORIES = (
    "broken_equipment", "poor_maintenance", "litter", "damaged_track", "insufficient_lighting",
    "toilet_not_working", "accessibility_issue", "incorrect_hours", "missing_facility", "new_park",
)
AGE_GROUPS = ("5-12", "13-17", "18-25", "26-45", "46-59", "60+")
MIN_OBSERVATIONS = 20

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
_PHONE = re.compile(r"(?:\+?\d[\s-]?){9,}")
_URL = re.compile(r"\bhttps?://\S+", re.I)
_TAG = re.compile(r"<[^>]*>")


def sanitise_text(s: str) -> str:
    s = _TAG.sub(" ", s)
    s = _EMAIL.sub("[removed]", s)
    s = _PHONE.sub("[removed]", s)
    s = _URL.sub("[link removed]", s)
    return re.sub(r"\s+", " ", s).strip()[:500]


class ValidationError(ValueError):
    pass


@dataclass
class CleanReport:
    park_ref: str
    category: str
    description: str
    observed_at: datetime


def validate_report(park_ref: str, category: str, description: str, observed_at: datetime | None,
                    honeypot: str | None = None, now: datetime | None = None) -> CleanReport:
    now = now or datetime.now(timezone.utc)
    if honeypot:
        raise ValidationError("Rejected as spam.")
    if not park_ref or len(park_ref) > 80:
        raise ValidationError("Choose a park.")
    if category not in CATEGORIES:
        raise ValidationError("Choose a valid category.")
    text = sanitise_text(description or "")
    if len(text) < 10:
        raise ValidationError("Please describe what you saw (at least 10 characters).")
    if re.search(r"(.)\1{9,}", text):
        raise ValidationError("Description looks like spam.")
    obs = observed_at or now
    if obs.tzinfo is None:
        obs = obs.replace(tzinfo=timezone.utc)
    if obs > now + timedelta(minutes=5):
        raise ValidationError("Observation date cannot be in the future.")
    if now - obs > timedelta(days=90):
        raise ValidationError("Observations older than 90 days cannot be submitted.")
    return CleanReport(park_ref, category, text, obs)


def _tokens(s: str) -> set[str]:
    return {w for w in re.sub(r"[^\w\s]", " ", s.lower()).split() if len(w) > 2}


def jaccard(a: str, b: str) -> float:
    A, B = _tokens(a), _tokens(b)
    if not A or not B:
        return 0.0
    return len(A & B) / len(A | B)


def is_duplicate(a: CleanReport, b_desc: str, b_obs: datetime, b_park: str, b_cat: str) -> bool:
    if a.park_ref != b_park or a.category != b_cat:
        return False
    if abs((a.observed_at - b_obs).total_seconds()) > 14 * 86400:
        return False
    return jaccard(a.description, b_desc) >= 0.5


def next_status(independent_reports: int, current: str) -> str:
    if current in ("verified", "rejected"):
        return current
    return "corroborated" if independent_reports >= 3 else "pending"
