const fs = require('fs');
const path = require('path');
const { getDatabase, getMetadata, transaction } = require('./database');

const LEGACY_STORE_PATH = process.env.DEVICE_STORE_PATH
  ? path.resolve(process.env.DEVICE_STORE_PATH)
  : path.join(__dirname, '..', 'data', 'devices.json');
const LEGACY_IMPORT_KEY = 'legacy_devices_json_import_v1';

const TYPE_PRESETS = {
  air_conditioner: {
    actions: ['turn_on', 'turn_off', 'set_temperature'],
    capabilities: {
      power: true,
      temperature: { min: 16, max: 30, step: 1, unit: 'celsius' },
      mode: ['cool', 'heat', 'dry', 'fan'],
      fanSpeed: ['low', 'medium', 'high', 'auto']
    }
  },
  fan: {
    actions: ['turn_on', 'turn_off'],
    capabilities: { power: true, fanSpeed: ['low', 'medium', 'high'] }
  },
  light: {
    actions: ['turn_on', 'turn_off'],
    capabilities: { power: true }
  },
  tv: {
    actions: ['turn_on', 'turn_off'],
    capabilities: { power: true }
  },
  other: {
    actions: ['turn_on', 'turn_off'],
    capabilities: { power: true }
  }
};

const DEFAULT_DEVICES = [{
  id: 'bedroom_ac',
  name: '卧室空调',
  type: 'air_conditioner',
  location: '卧室',
  controlType: 'ir',
  paired: true,
  actions: TYPE_PRESETS.air_conditioner.actions,
  capabilities: TYPE_PRESETS.air_conditioner.capabilities,
  irProfile: { brand: 'unknown', model: 'unknown', learnedCodes: {} }
}];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : clone(fallback);
  } catch (error) {
    return clone(fallback);
  }
}

function rowToDevice(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    location: row.location,
    controlType: row.control_type,
    paired: Boolean(row.paired),
    actions: parseJson(row.actions_json, []),
    capabilities: parseJson(row.capabilities_json, {}),
    irProfile: {
      brand: row.ir_brand || 'unknown',
      model: row.ir_model || 'unknown',
      learnedCodes: {}
    }
  };
}

function normalizeDevice(device) {
  const type = TYPE_PRESETS[device.type] ? device.type : 'other';
  const preset = TYPE_PRESETS[type];
  return {
    id: String(device.id || '').trim(),
    name: String(device.name || '').trim(),
    type,
    location: String(device.location || '').trim(),
    controlType: device.controlType || 'ir',
    paired: device.paired !== false,
    actions: Array.isArray(device.actions) ? clone(device.actions) : clone(preset.actions),
    capabilities: device.capabilities && typeof device.capabilities === 'object'
      ? clone(device.capabilities)
      : clone(preset.capabilities),
    irProfile: {
      brand: device.irProfile?.brand || 'unknown',
      model: device.irProfile?.model || 'unknown',
      learnedCodes: {}
    }
  };
}

function insertDevice(db, device) {
  const normalized = normalizeDevice(device);
  if (!normalized.id || !normalized.name) return false;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO devices (
      id, name, type, location, control_type, paired,
      actions_json, capabilities_json, ir_brand, ir_model, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    normalized.id,
    normalized.name,
    normalized.type,
    normalized.location,
    normalized.controlType,
    normalized.paired ? 1 : 0,
    JSON.stringify(normalized.actions),
    JSON.stringify(normalized.capabilities),
    normalized.irProfile.brand,
    normalized.irProfile.model,
    now,
    now
  );
  db.prepare(`
    INSERT OR IGNORE INTO device_runtime_state (
      device_id, status, assumed_state, target_temperature,
      last_command_json, state_confidence, updated_at
    ) VALUES (?, 'unknown', 'unknown', NULL, NULL, 'unknown', ?)
  `).run(normalized.id, now);
  return true;
}

function readLegacyDevices() {
  if (!fs.existsSync(LEGACY_STORE_PATH)) return clone(DEFAULT_DEVICES);
  try {
    const parsed = JSON.parse(fs.readFileSync(LEGACY_STORE_PATH, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('devices.json 根节点必须是数组');
    return parsed;
  } catch (error) {
    console.error(`旧设备数据导入失败，将使用默认设备：${error.message}`);
    return clone(DEFAULT_DEVICES);
  }
}

function load() {
  const db = getDatabase();
  if (!getMetadata(LEGACY_IMPORT_KEY)) {
    const count = Number(db.prepare('SELECT COUNT(*) AS count FROM devices').get().count);
    const legacyDevices = count === 0 ? readLegacyDevices() : [];
    transaction((transactionDb) => {
      for (const device of legacyDevices) insertDevice(transactionDb, device);
      transactionDb.prepare(`
        INSERT INTO app_metadata (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(LEGACY_IMPORT_KEY, 'completed', new Date().toISOString());
    });
    if (legacyDevices.length) {
      console.log(`已将 ${legacyDevices.length} 台旧设备导入 SQLite`);
    }
  }

  db.exec(`
    INSERT OR IGNORE INTO device_runtime_state (
      device_id, status, assumed_state, target_temperature,
      last_command_json, state_confidence, updated_at
    )
    SELECT id, 'unknown', 'unknown', NULL, NULL, 'unknown', updated_at FROM devices
  `);
  return getAll();
}

function getAll() {
  return getDatabase()
    .prepare('SELECT * FROM devices ORDER BY created_at, id')
    .all()
    .map(rowToDevice);
}

function getById(deviceId) {
  return rowToDevice(getDatabase().prepare('SELECT * FROM devices WHERE id = ?').get(deviceId));
}

function getTypePreset(type) {
  return TYPE_PRESETS[type] || TYPE_PRESETS.other;
}

function add(device) {
  if (getById(device.id)) return { success: false, message: '设备 ID 已存在' };
  const normalized = normalizeDevice(device);
  if (!normalized.id || !normalized.name) return { success: false, message: '设备 ID 和名称不能为空' };
  transaction((db) => insertDevice(db, normalized));
  return { success: true, device: getById(normalized.id) };
}

function update(deviceId, updates) {
  const current = getById(deviceId);
  if (!current) return { success: false, message: '设备不存在' };

  const next = { ...current };
  const allowed = ['name', 'type', 'location', 'actions', 'capabilities', 'irProfile'];
  for (const key of allowed) {
    if (updates[key] !== undefined) next[key] = clone(updates[key]);
  }

  if (updates.type && updates.actions === undefined && updates.capabilities === undefined) {
    const preset = getTypePreset(updates.type);
    next.actions = clone(preset.actions);
    next.capabilities = clone(preset.capabilities);
  }

  const normalized = normalizeDevice(next);
  getDatabase().prepare(`
    UPDATE devices SET
      name = ?, type = ?, location = ?, control_type = ?, paired = ?,
      actions_json = ?, capabilities_json = ?, ir_brand = ?, ir_model = ?, updated_at = ?
    WHERE id = ?
  `).run(
    normalized.name,
    normalized.type,
    normalized.location,
    normalized.controlType,
    normalized.paired ? 1 : 0,
    JSON.stringify(normalized.actions),
    JSON.stringify(normalized.capabilities),
    normalized.irProfile.brand,
    normalized.irProfile.model,
    new Date().toISOString(),
    deviceId
  );
  return { success: true, device: getById(deviceId) };
}

function remove(deviceId) {
  const result = getDatabase().prepare('DELETE FROM devices WHERE id = ?').run(deviceId);
  if (result.changes === 0) return { success: false, message: '设备不存在' };
  return { success: true };
}

function getAllRuntimeStates() {
  return getDatabase().prepare('SELECT * FROM device_runtime_state').all().map((row) => ({
    deviceId: row.device_id,
    status: row.status,
    assumedState: row.assumed_state,
    targetTemperature: row.target_temperature,
    lastCommand: parseJson(row.last_command_json, null),
    stateConfidence: row.state_confidence,
    updatedAt: row.updated_at
  }));
}

function saveRuntimeState(deviceId, updates) {
  const current = getDatabase().prepare('SELECT * FROM device_runtime_state WHERE device_id = ?').get(deviceId);
  if (!current) return false;
  const next = {
    status: updates.status ?? current.status,
    assumedState: updates.assumedState ?? current.assumed_state,
    targetTemperature: updates.targetTemperature !== undefined
      ? updates.targetTemperature
      : current.target_temperature,
    lastCommand: updates.lastCommand !== undefined
      ? updates.lastCommand
      : parseJson(current.last_command_json, null),
    stateConfidence: updates.stateConfidence ?? current.state_confidence
  };
  getDatabase().prepare(`
    UPDATE device_runtime_state SET
      status = ?, assumed_state = ?, target_temperature = ?,
      last_command_json = ?, state_confidence = ?, updated_at = ?
    WHERE device_id = ?
  `).run(
    next.status,
    next.assumedState,
    next.targetTemperature ?? null,
    next.lastCommand ? JSON.stringify(next.lastCommand) : null,
    next.stateConfidence,
    new Date().toISOString(),
    deviceId
  );
  return true;
}

module.exports = {
  TYPE_PRESETS,
  add,
  getAll,
  getAllRuntimeStates,
  getById,
  getTypePreset,
  load,
  remove,
  saveRuntimeState,
  update
};
