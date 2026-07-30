-- D1 schema for NLP++ extension telemetry.
CREATE TABLE IF NOT EXISTS events (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	ts         INTEGER NOT NULL,   -- epoch ms (server-side receive time)
	event      TEXT    NOT NULL,   -- e.g. "extension.activated", "format.document"
	is_error   INTEGER DEFAULT 0,
	version    TEXT,               -- extension version
	vscode     TEXT,               -- VS Code version
	platform   TEXT,               -- process.platform (win32/darwin/linux)
	arch       TEXT,               -- process.arch (x64/arm64) -- matters for engine ABI
	engine     TEXT,               -- NLP++ engine version in use, once detected
	machine_id TEXT,               -- anonymized vscode.env.machineId
	session_id TEXT,               -- vscode.env.sessionId; groups events in one window
	props      TEXT,               -- small JSON blob of string properties
	metrics    TEXT                -- small JSON blob of numeric measurements
);

CREATE INDEX IF NOT EXISTS idx_events_event   ON events(event);
CREATE INDEX IF NOT EXISTS idx_events_ts       ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_machine  ON events(machine_id);
CREATE INDEX IF NOT EXISTS idx_events_session  ON events(session_id);

-- Migration for a database created before arch/session_id existed. SQLite has no
-- "ADD COLUMN IF NOT EXISTS", so these two error harmlessly on a fresh schema run
-- (the columns are already there); run them once by hand on an existing D1:
--   ALTER TABLE events ADD COLUMN arch TEXT;
--   ALTER TABLE events ADD COLUMN engine TEXT;
--   ALTER TABLE events ADD COLUMN session_id TEXT;
