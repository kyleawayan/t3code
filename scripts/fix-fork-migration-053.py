#!/usr/bin/env python3
"""One-time database fix for machines that ran the v0.0.42 fork.

That fork recorded its thread recap migration as id 53, the same id as upstream's
PullRequestFilesViewed. The migrator skips every id up to the highest one recorded,
so upstream's 053 never runs and the table behind "Viewed" marks on pull request
files is missing. This creates that table exactly as upstream's 053 does and records
053 under its upstream name. Nothing else in the database changes.

Quit T3 Code first. It does not matter whether the new build has been opened yet:

    python3 fix-fork-migration-053.py [path/to/database]

Without a path it checks ~/.t3/userdata: statev2.sqlite once the new build has run,
otherwise state.sqlite, which the new build copies on its first launch. Once
statev2.sqlite exists, state.sqlite is the old build's rollback copy and is left
alone. On Windows with the WSL backend turned on, run it inside WSL as well.

A backup is written next to the database before anything changes, and running it
again does nothing.
"""

import sqlite3
import sys
import time
from pathlib import Path

FORK_NAME = "ProjectionThreadRecap"
UPSTREAM_NAME = "PullRequestFilesViewed"

# Verbatim from apps/server/src/persistence/Migrations/053_PullRequestFilesViewed.ts.
CREATE_FILES_VIEWED = """
CREATE TABLE IF NOT EXISTS pull_request_files_viewed (
  provider TEXT NOT NULL,
  host TEXT NOT NULL,
  repository TEXT NOT NULL,
  number INTEGER NOT NULL,
  viewer TEXT NOT NULL,
  path TEXT NOT NULL,
  revision TEXT,
  viewed_at TEXT NOT NULL,
  PRIMARY KEY (provider, host, repository, number, viewer, path)
) WITHOUT ROWID
"""


def default_database() -> Path:
    userdata = Path.home() / ".t3" / "userdata"
    v2 = userdata / "statev2.sqlite"
    return v2 if v2.is_file() else userdata / "state.sqlite"


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)
    ).fetchone()
    return row is not None


def main() -> int:
    db_path = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else default_database()
    if not db_path.is_file():
        print(f"No database at {db_path}")
        return 1
    print(f"Checking {db_path}")

    # Autocommit mode, so the explicit BEGIN below covers the DDL as well.
    conn = sqlite3.connect(db_path, isolation_level=None)
    try:
        if not table_exists(conn, "effect_sql_migrations"):
            print("Nothing to fix: this database has no migration history.")
            return 0
        row = conn.execute(
            "SELECT name FROM effect_sql_migrations WHERE migration_id = 53"
        ).fetchone()
        recorded = row[0] if row else None
        has_table = table_exists(conn, "pull_request_files_viewed")
        print(
            f"Migration 53: {recorded or 'not recorded'}; "
            f"pull_request_files_viewed: {'present' if has_table else 'missing'}"
        )
        needs_fix = recorded == FORK_NAME or (recorded == UPSTREAM_NAME and not has_table)
        if not needs_fix:
            print("Nothing to fix.")
            return 0

        backup_path = db_path.with_name(f"{db_path.name}.backup-{time.strftime('%Y%m%d-%H%M%S')}")
        backup = sqlite3.connect(backup_path)
        try:
            conn.backup(backup)
        finally:
            backup.close()
        print(f"Backed up to {backup_path}")

        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.execute(CREATE_FILES_VIEWED)
            conn.execute(
                "UPDATE effect_sql_migrations SET name = ? WHERE migration_id = 53",
                (UPSTREAM_NAME,),
            )
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        print(f"Fixed: created pull_request_files_viewed and recorded migration 53 as {UPSTREAM_NAME}.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
