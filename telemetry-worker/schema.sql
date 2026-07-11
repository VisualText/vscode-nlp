-- D1 schema for NLP++ extension telemetry.
CREATE TABLE IF NOT EXISTS events (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	ts         INTEGER NOT NULL,   -- epoch ms (server-side receive time)
	event      TEXT    NOT NULL,   -- e.g. "extension.activated", "format.document"
	is_error   INTEGER DEFAULT 0,
	version    TEXT,               -- extension version
	vscode     TEXT,               -- VS Code version
	platform   TEXT,               -- process.platform (win32/darwin/linux)
	machine_id TEXT,               -- anonymized vscode.env.machineId
	props      TEXT,               -- small JSON blob of string properties
	metrics    TEXT                -- small JSON blob of numeric measurements
);

CREATE INDEX IF NOT EXISTS idx_events_event   ON events(event);
CREATE INDEX IF NOT EXISTS idx_events_ts       ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_machine  ON events(machine_id);
