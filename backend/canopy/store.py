"""SQLite repository for reports and check-ins (development default).

Production uses the PostgreSQL tables in db/migrations/001_init.sql; the API only talks to this
small interface, so a Postgres implementation can replace it without touching the routes.
"""
from __future__ import annotations

import hashlib
import sqlite3
import time
import uuid
from datetime import datetime, timezone

from .community import MIN_OBSERVATIONS, CleanReport, is_duplicate, next_status


class Store:
    def __init__(self, path: str = ":memory:", salt: str = "dev-salt"):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.salt = salt
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS reports (
              id TEXT PRIMARY KEY, park_ref TEXT, category TEXT, description TEXT,
              observed_at TEXT, submitted_at TEXT, status TEXT, duplicate_of TEXT, client_hash TEXT);
            CREATE TABLE IF NOT EXISTS checkins (
              park_ref TEXT, age_group TEXT, hour_ist INTEGER, weekend INTEGER);
            CREATE TABLE IF NOT EXISTS hits (client_hash TEXT, ts REAL);
            """
        )

    # ---- rate limiting: salted hash of the caller key, never stored raw
    def client_hash(self, key: str) -> str:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")  # rotates daily
        return hashlib.sha256(f"{self.salt}|{day}|{key}".encode()).hexdigest()[:24]

    def allow(self, client_hash: str, max_per_hour: int = 5, now: float | None = None) -> bool:
        now = now or time.time()
        n = self.db.execute("SELECT count(*) FROM hits WHERE client_hash=? AND ts>?", (client_hash, now - 3600)).fetchone()[0]
        if n >= max_per_hour:
            return False
        self.db.execute("INSERT INTO hits VALUES (?,?)", (client_hash, now))
        self.db.commit()
        return True

    # ---- reports
    def add_report(self, r: CleanReport, client_hash: str) -> dict:
        rid = str(uuid.uuid4())
        dup = None
        for row in self.db.execute("SELECT * FROM reports WHERE park_ref=? AND category=? AND duplicate_of IS NULL", (r.park_ref, r.category)):
            if is_duplicate(r, row["description"], datetime.fromisoformat(row["observed_at"]), row["park_ref"], row["category"]):
                dup = row
                break
        status = "duplicate" if dup else "pending"
        self.db.execute(
            "INSERT INTO reports VALUES (?,?,?,?,?,?,?,?,?)",
            (rid, r.park_ref, r.category, r.description, r.observed_at.isoformat(), datetime.now(timezone.utc).isoformat(), status, dup["id"] if dup else None, client_hash),
        )
        if dup:
            hashes = {x["client_hash"] for x in self.db.execute("SELECT client_hash FROM reports WHERE id=? OR duplicate_of=?", (dup["id"], dup["id"]))}
            new = next_status(len(hashes), dup["status"])
            self.db.execute("UPDATE reports SET status=? WHERE id=?", (new, dup["id"]))
        self.db.commit()
        return {"id": rid, "status": status, "duplicate_of": dup["id"] if dup else None, "official": False}

    def moderate(self, report_id: str, status: str) -> bool:
        if status not in ("verified", "rejected"):
            raise ValueError("moderators may only verify or reject")
        cur = self.db.execute("UPDATE reports SET status=? WHERE id=? AND duplicate_of IS NULL", (status, report_id))
        self.db.commit()
        return cur.rowcount > 0

    def public_reports(self, park_ref: str) -> list[dict]:
        """Only corroborated or verified reports are public; client_hash is never returned."""
        rows = self.db.execute(
            "SELECT id, park_ref, category, description, observed_at, status FROM reports WHERE park_ref=? AND status IN ('corroborated','verified') ORDER BY observed_at DESC",
            (park_ref,),
        )
        return [dict(r) | {"official": False} for r in rows]

    # ---- attendance (k-anonymous)
    def add_checkin(self, park_ref: str, age_group: str, hour: int, weekend: bool) -> None:
        self.db.execute("INSERT INTO checkins VALUES (?,?,?,?)", (park_ref, age_group, hour, int(weekend)))
        self.db.commit()

    def attendance(self, park_ref: str, k: int = MIN_OBSERVATIONS) -> dict:
        bins = self.db.execute(
            "SELECT hour_ist, weekend, count(*) n FROM checkins WHERE park_ref=? GROUP BY hour_ist, weekend", (park_ref,)
        ).fetchall()
        released, suppressed = [], 0
        for b in bins:
            if b["n"] < k:
                suppressed += 1
                continue
            for g in self.db.execute(
                "SELECT age_group, count(*) c FROM checkins WHERE park_ref=? AND hour_ist=? AND weekend=? GROUP BY age_group",
                (park_ref, b["hour_ist"], b["weekend"]),
            ):
                released.append({"hour": b["hour_ist"], "weekend": bool(b["weekend"]), "age_group": g["age_group"], "share": g["c"] / b["n"]})
        return {"released": released, "suppressed_bins": suppressed, "min_observations": k}
