const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DATABASE_PATH = path.join(__dirname, '..', 'data', 'smart-home.db');
const DATABASE_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : DEFAULT_DATABASE_PATH;

let database = null;

function ensureDatabaseDirectory() {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
}

function migrate(db) {
  let version = Number(db.prepare('PRAGMA user_version').get().user_version || 0);
  if (version < 1) {
    db.exec(`
    BEGIN IMMEDIATE;

    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      control_type TEXT NOT NULL DEFAULT 'ir',
      paired INTEGER NOT NULL DEFAULT 1,
      actions_json TEXT NOT NULL,
      capabilities_json TEXT NOT NULL,
      ir_brand TEXT NOT NULL DEFAULT 'unknown',
      ir_model TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_runtime_state (
      device_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'unknown',
      assumed_state TEXT NOT NULL DEFAULT 'unknown',
      target_temperature INTEGER,
      last_command_json TEXT,
      state_confidence TEXT NOT NULL DEFAULT 'unknown',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ir_codes (
      device_id TEXT NOT NULL,
      action TEXT NOT NULL,
      variant_key TEXT NOT NULL DEFAULT 'default',
      protocol TEXT NOT NULL,
      code TEXT NOT NULL,
      bits INTEGER NOT NULL,
      learned_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (device_id, action, variant_key),
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS command_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      device_name TEXT,
      command TEXT NOT NULL,
      value_json TEXT,
      source TEXT NOT NULL,
      success INTEGER NOT NULL,
      message TEXT NOT NULL,
      state_confidence TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_command_events_created_at
      ON command_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_command_events_device_id
      ON command_events(device_id, created_at DESC);

    PRAGMA user_version = 1;
    COMMIT;
  `);
    version = 1;
  }

  if (version < 2) {
    db.exec(`
      BEGIN IMMEDIATE;

      CREATE TABLE IF NOT EXISTS model_configs (
        type TEXT PRIMARY KEY CHECK (type IN ('llm', 'asr', 'tts')),
        enabled INTEGER NOT NULL DEFAULT 0,
        provider TEXT NOT NULL DEFAULT 'openai-compatible',
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL,
        settings_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      PRAGMA user_version = 2;
      COMMIT;
    `);
    version = 2;
  }

  if (version < 3) {
    db.exec(`
      BEGIN IMMEDIATE;

      UPDATE model_configs
      SET base_url = '', enabled = 0, updated_at = datetime('now')
      WHERE api_key = ''
        AND base_url = 'https://api.openai.com/v1';

      PRAGMA user_version = 3;
      COMMIT;
    `);
    version = 3;
  }

  if (version < 4) {
    db.exec(`
      BEGIN IMMEDIATE;

      UPDATE model_configs
      SET base_url = rtrim(base_url, '/') || '/chat/completions', updated_at = datetime('now')
      WHERE type = 'llm'
        AND base_url != ''
        AND base_url NOT LIKE '%/chat/completions';

      UPDATE model_configs
      SET base_url = rtrim(base_url, '/') || '/audio/transcriptions', updated_at = datetime('now')
      WHERE type = 'asr'
        AND base_url != ''
        AND base_url NOT LIKE '%/audio/transcriptions';

      UPDATE model_configs
      SET base_url = rtrim(base_url, '/') || '/audio/speech', updated_at = datetime('now')
      WHERE type = 'tts'
        AND base_url != ''
        AND base_url NOT LIKE '%/audio/speech';

      PRAGMA user_version = 4;
      COMMIT;
    `);
    version = 4;
  }

  if (version < 5) {
    db.exec(`
      BEGIN IMMEDIATE;

      UPDATE model_configs
      SET base_url = substr(base_url, 1, length(base_url) - length('/chat/completions')),
          settings_json = json_set(settings_json, '$.endpointPath', '/chat/completions'),
          updated_at = datetime('now')
      WHERE type = 'llm'
        AND base_url LIKE '%/chat/completions';

      UPDATE model_configs
      SET base_url = CASE
            WHEN base_url LIKE '%/audio/transcriptions'
              THEN substr(base_url, 1, length(base_url) - length('/audio/transcriptions'))
            ELSE base_url
          END,
          enabled = 0,
          settings_json = json_set(settings_json, '$.endpointPath', ''),
          updated_at = datetime('now')
      WHERE type = 'asr';

      UPDATE model_configs
      SET base_url = CASE
            WHEN base_url LIKE '%/audio/speech'
              THEN substr(base_url, 1, length(base_url) - length('/audio/speech'))
            ELSE base_url
          END,
          enabled = 0,
          settings_json = json_set(settings_json, '$.endpointPath', ''),
          updated_at = datetime('now')
      WHERE type = 'tts';

      PRAGMA user_version = 5;
      COMMIT;
    `);
  }
}

function getDatabase() {
  if (database) return database;
  ensureDatabaseDirectory();
  database = new Database(DATABASE_PATH);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA journal_mode = WAL');
  database.exec('PRAGMA busy_timeout = 5000');
  migrate(database);
  return database;
}

function transaction(callback) {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback(db);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function getMetadata(key) {
  const row = getDatabase().prepare('SELECT value FROM app_metadata WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setMetadata(key, value) {
  const now = new Date().toISOString();
  getDatabase().prepare(`
    INSERT INTO app_metadata (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), now);
}

function closeDatabase() {
  if (!database) return;
  database.close();
  database = null;
}

module.exports = {
  DATABASE_PATH,
  closeDatabase,
  getDatabase,
  getMetadata,
  setMetadata,
  transaction
};
