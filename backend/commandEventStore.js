const { getDatabase } = require('./database');

function parseJson(value) {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function recordCommandEvent(event) {
  const createdAt = event.createdAt || new Date().toISOString();
  const result = getDatabase().prepare(`
    INSERT INTO command_events (
      device_id, device_name, command, value_json, source,
      success, message, state_confidence, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.deviceId || null,
    event.deviceName || null,
    event.command,
    event.value === undefined ? null : JSON.stringify(event.value),
    event.source || 'unknown',
    event.success ? 1 : 0,
    event.message || '',
    event.stateConfidence || null,
    createdAt
  );
  return Number(result.lastInsertRowid);
}

function getRecentCommandEvents(limit = 20) {
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  return getDatabase().prepare(`
    SELECT * FROM command_events ORDER BY id DESC LIMIT ?
  `).all(normalizedLimit).map((row) => ({
    id: row.id,
    deviceId: row.device_id,
    deviceName: row.device_name,
    command: row.command,
    value: parseJson(row.value_json),
    source: row.source,
    success: Boolean(row.success),
    message: row.message,
    stateConfidence: row.state_confidence,
    createdAt: row.created_at
  }));
}

module.exports = { getRecentCommandEvents, recordCommandEvent };
