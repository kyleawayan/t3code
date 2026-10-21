#!/usr/bin/env python3
"""One-time database fix before first opening a v0.1.1 fork build.

The v0.0.42 fork recorded its thread recap migration as id 53. Upstream's 053
(PullRequestFilesViewed) uses the same id, and the migrator skips every id up to
the highest one recorded, so it would never run. Removing the fork's record lets
upstream's 053 run on the next start.

Quit T3 Code first, then run:

    python3 fix-fork-migration-053.py [path/to/state.sqlite]

The default path is ~/.t3/userdata/state.sqlite. A backup is written next to the
database before anything changes.
"""

import sqlite3
import sys
import time
from pathlib import Path

FORK_MIGRATION = (53, "ProjectionThreadRecap")


def main() -> int:
    arg = sys.argv[1] if len(sys.argv) > 1 else "~/.t3/userdata/state.sqlite"
    db_path = Path(arg).expanduser()
    if not db_path.is_file():
        print(f"No database at {db_path}")
        return 1

    conn = sqlite3.connect(db_path)
    try:
        has_table = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'"
        ).fetchone()
        row = (
            conn.execute(
                "SELECT name FROM effect_sql_migrations WHERE migration_id = ?",
                (FORK_MIGRATION[0],),
            ).fetchone()
            if has_table
            else None
        )
        if row is None or row[0] != FORK_MIGRATION[1]:
            recorded = row[0] if row else "nothing"
            print(f"Nothing to fix: migration 53 is {recorded}.")
            return 0

        backup_path = db_path.with_name(f"{db_path.name}.backup-{time.strftime('%Y%m%d-%H%M%S')}")
        backup = sqlite3.connect(backup_path)
        try:
            conn.backup(backup)
        finally:
            backup.close()
        print(f"Backed up to {backup_path}")

        with conn:
            conn.execute(
                "DELETE FROM effect_sql_migrations WHERE migration_id = ? AND name = ?",
                FORK_MIGRATION,
            )
        print("Removed the fork's migration 53. Open the new build now.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
