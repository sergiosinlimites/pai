import csv
import io
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ProductionStore:
    """SQLite-backed production history and monotonic logical total."""

    def __init__(self, database_path: str) -> None:
        path = Path(database_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        self._initialize()

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def _initialize(self) -> None:
        with self._lock, self._connection:
            self._connection.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS box_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    logical_total INTEGER NOT NULL UNIQUE,
                    plc_total INTEGER NOT NULL,
                    completed_at TEXT NOT NULL,
                    observed_at TEXT NOT NULL,
                    recovered INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS stacks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at TEXT NOT NULL,
                    completed_at TEXT,
                    target INTEGER NOT NULL,
                    start_total INTEGER NOT NULL,
                    end_total INTEGER,
                    status TEXT NOT NULL DEFAULT 'active'
                );
                CREATE TABLE IF NOT EXISTS state_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    state_code INTEGER NOT NULL,
                    state_label TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    ended_at TEXT
                );
                CREATE TABLE IF NOT EXISTS fault_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fault_code INTEGER NOT NULL,
                    fault_label TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    cleared_at TEXT
                );
                CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )
            self._connection.execute(
                "INSERT OR IGNORE INTO settings(key, value) VALUES('max_stack_size', '100')"
            )
            self._connection.execute(
                "INSERT OR IGNORE INTO settings(key, value) VALUES('timezone', 'America/Bogota')"
            )
            self._connection.execute(
                "INSERT OR IGNORE INTO meta(key, value) VALUES('logical_total', '0')"
            )

    def settings(self) -> dict:
        with self._lock:
            rows = self._connection.execute("SELECT key, value FROM settings").fetchall()
        values = {row["key"]: row["value"] for row in rows}
        return {
            "max_stack_size": int(values.get("max_stack_size", "100")),
            "timezone": values.get("timezone", "America/Bogota"),
        }

    def update_settings(
        self,
        *,
        max_stack_size: Optional[int] = None,
        timezone_name: Optional[str] = None,
    ) -> dict:
        with self._lock, self._connection:
            if max_stack_size is not None:
                self._connection.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES('max_stack_size', ?)",
                    (str(max_stack_size),),
                )
            if timezone_name is not None:
                try:
                    ZoneInfo(timezone_name)
                except ZoneInfoNotFoundError as exc:
                    raise ValueError(f"Unknown timezone: {timezone_name}") from exc
                self._connection.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES('timezone', ?)",
                    (timezone_name,),
                )
        return self.settings()

    def logical_total(self) -> int:
        with self._lock:
            row = self._connection.execute(
                "SELECT value FROM meta WHERE key='logical_total'"
            ).fetchone()
        return int(row["value"]) if row else 0

    def last_plc_total(self) -> Optional[int]:
        with self._lock:
            row = self._connection.execute(
                "SELECT value FROM meta WHERE key='last_plc_total'"
            ).fetchone()
        return int(row["value"]) if row else None

    def ingest_status(
        self,
        *,
        plc_total: int,
        stack_count: int,
        active_target: int,
        state_code: int,
        state_label: str,
        fault_code: int,
        fault_label: str,
        observed_at: Optional[str] = None,
    ) -> list[dict]:
        observed_at = observed_at or utc_now()
        new_events: list[dict] = []
        with self._lock, self._connection:
            last_plc = self.last_plc_total()
            logical_total = self.logical_total()

            if last_plc is None:
                logical_total = max(logical_total, plc_total)
                self._set_meta("logical_total", logical_total)
                self._set_meta("last_plc_total", plc_total)
            elif plc_total > last_plc:
                delta = plc_total - last_plc
                recovered = delta > 1
                for offset in range(1, delta + 1):
                    logical_total += 1
                    event = {
                        "logical_total": logical_total,
                        "plc_total": last_plc + offset,
                        "completed_at": observed_at,
                        "observed_at": observed_at,
                        "recovered": recovered,
                    }
                    self._connection.execute(
                        """
                        INSERT OR IGNORE INTO box_events(
                            logical_total, plc_total, completed_at, observed_at, recovered
                        ) VALUES(?, ?, ?, ?, ?)
                        """,
                        (
                            event["logical_total"],
                            event["plc_total"],
                            event["completed_at"],
                            event["observed_at"],
                            int(event["recovered"]),
                        ),
                    )
                    new_events.append(event)
                self._set_meta("logical_total", logical_total)
                self._set_meta("last_plc_total", plc_total)
            elif plc_total < last_plc:
                # PLC replacement/reset must never decrease the historical application total.
                self._set_meta("last_plc_total", plc_total)

            self._update_stack(
                logical_total=logical_total,
                stack_count=stack_count,
                active_target=max(active_target, 1),
                observed_at=observed_at,
            )
            self._update_state(state_code, state_label, observed_at)
            self._update_fault(fault_code, fault_label, observed_at)
        return new_events

    def _set_meta(self, key: str, value: object) -> None:
        self._connection.execute(
            "INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)",
            (key, str(value)),
        )

    def _update_stack(
        self,
        *,
        logical_total: int,
        stack_count: int,
        active_target: int,
        observed_at: str,
    ) -> None:
        row = self._connection.execute(
            "SELECT * FROM stacks WHERE status='active' ORDER BY id DESC LIMIT 1"
        ).fetchone()
        inferred_start = max(0, logical_total - max(stack_count, 0))
        if row is None:
            self._connection.execute(
                """
                INSERT INTO stacks(started_at, target, start_total, status)
                VALUES(?, ?, ?, 'active')
                """,
                (observed_at, active_target, inferred_start),
            )
            return

        row_id = int(row["id"])
        start_total = int(row["start_total"])
        target = max(int(row["target"]), 1)
        while logical_total - start_total >= target:
            completed_total = start_total + target
            self._connection.execute(
                """
                UPDATE stacks
                SET completed_at=?, end_total=?, status='completed'
                WHERE id=?
                """,
                (observed_at, completed_total, row_id),
            )
            cursor = self._connection.execute(
                """
                INSERT INTO stacks(started_at, target, start_total, status)
                VALUES(?, ?, ?, 'active')
                """,
                (observed_at, active_target, completed_total),
            )
            row_id = int(cursor.lastrowid)
            start_total = completed_total
            target = active_target

    def _update_state(self, code: int, label: str, observed_at: str) -> None:
        row = self._connection.execute(
            "SELECT * FROM state_events WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1"
        ).fetchone()
        if row and int(row["state_code"]) == code:
            return
        if row:
            self._connection.execute(
                "UPDATE state_events SET ended_at=? WHERE id=?",
                (observed_at, row["id"]),
            )
        self._connection.execute(
            """
            INSERT INTO state_events(state_code, state_label, started_at)
            VALUES(?, ?, ?)
            """,
            (code, label, observed_at),
        )

    def _update_fault(self, code: int, label: str, observed_at: str) -> None:
        row = self._connection.execute(
            "SELECT * FROM fault_events WHERE cleared_at IS NULL ORDER BY id DESC LIMIT 1"
        ).fetchone()
        if code == 0:
            if row:
                self._connection.execute(
                    "UPDATE fault_events SET cleared_at=? WHERE id=?",
                    (observed_at, row["id"]),
                )
            return
        if row and int(row["fault_code"]) == code:
            return
        if row:
            self._connection.execute(
                "UPDATE fault_events SET cleared_at=? WHERE id=?",
                (observed_at, row["id"]),
            )
        self._connection.execute(
            """
            INSERT INTO fault_events(fault_code, fault_label, started_at)
            VALUES(?, ?, ?)
            """,
            (code, label, observed_at),
        )

    def recent_events(self, limit: int = 50) -> list[dict]:
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT logical_total, plc_total, completed_at, observed_at, recovered
                FROM box_events ORDER BY id DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) | {"recovered": bool(row["recovered"])} for row in rows]

    def stacks(self, limit: int = 50) -> list[dict]:
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT id, started_at, completed_at, target, start_total, end_total, status,
                       CASE
                         WHEN end_total IS NULL THEN MAX(0, ? - start_total)
                         ELSE end_total - start_total
                       END AS processed_count
                FROM stacks ORDER BY id DESC LIMIT ?
                """,
                (self.logical_total(), limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def summary(self) -> dict:
        now = datetime.now(timezone.utc)
        hour_ago = (now - timedelta(hours=1)).isoformat()
        day_ago = (now - timedelta(hours=24)).isoformat()
        with self._lock:
            boxes_last_hour = self._connection.execute(
                "SELECT COUNT(*) AS value FROM box_events WHERE completed_at>=?",
                (hour_ago,),
            ).fetchone()["value"]
            boxes_last_24h = self._connection.execute(
                "SELECT COUNT(*) AS value FROM box_events WHERE completed_at>=?",
                (day_ago,),
            ).fetchone()["value"]
            stacks_completed = self._connection.execute(
                "SELECT COUNT(*) AS value FROM stacks WHERE status='completed'"
            ).fetchone()["value"]
            cycle_rows = self._connection.execute(
                """
                SELECT completed_at FROM box_events
                WHERE recovered=0 ORDER BY id DESC LIMIT 101
                """
            ).fetchall()
            state_rows = self._connection.execute(
                """
                SELECT state_code, started_at, COALESCE(ended_at, ?) AS ended_at
                FROM state_events WHERE started_at>=? OR ended_at>=?
                """,
                (now.isoformat(), day_ago, day_ago),
            ).fetchall()
            hourly_rows = self._connection.execute(
                """
                SELECT substr(completed_at, 1, 13) || ':00:00Z' AS hour, COUNT(*) AS count
                FROM box_events WHERE completed_at>=?
                GROUP BY substr(completed_at, 1, 13) ORDER BY hour
                """,
                (day_ago,),
            ).fetchall()

        timestamps = [datetime.fromisoformat(row["completed_at"]) for row in reversed(cycle_rows)]
        intervals = [
            (timestamps[index] - timestamps[index - 1]).total_seconds()
            for index in range(1, len(timestamps))
        ]
        durations = {"running_seconds_24h": 0.0, "paused_seconds_24h": 0.0}
        for row in state_rows:
            start = max(datetime.fromisoformat(row["started_at"]), now - timedelta(hours=24))
            end = min(datetime.fromisoformat(row["ended_at"]), now)
            seconds = max(0.0, (end - start).total_seconds())
            if row["state_code"] == 3:
                durations["running_seconds_24h"] += seconds
            elif row["state_code"] == 4:
                durations["paused_seconds_24h"] += seconds

        return {
            "historical_total": self.logical_total(),
            "boxes_last_hour": boxes_last_hour,
            "boxes_last_24h": boxes_last_24h,
            "stacks_completed": stacks_completed,
            "average_cycle_seconds": round(sum(intervals) / len(intervals), 2) if intervals else None,
            "hourly_production": [dict(row) for row in hourly_rows],
            **{key: round(value, 1) for key, value in durations.items()},
        }

    def export_csv(self) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            ["logical_total", "plc_total", "completed_at", "observed_at", "recovered"]
        )
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT logical_total, plc_total, completed_at, observed_at, recovered
                FROM box_events ORDER BY id
                """
            ).fetchall()
        for row in rows:
            writer.writerow(
                [
                    row["logical_total"],
                    row["plc_total"],
                    row["completed_at"],
                    row["observed_at"],
                    bool(row["recovered"]),
                ]
            )
        return output.getvalue()
