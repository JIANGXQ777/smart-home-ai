const fs = require('fs');
const path = require('path');
const { getDatabase, getMetadata, transaction } = require('./database');

const LEGACY_STORE_PATH = process.env.IR_CODE_STORE_PATH
  ? path.resolve(process.env.IR_CODE_STORE_PATH)
  : path.join(__dirname, '..', 'data', 'ir_codes.json');
const LEGACY_IMPORT_KEY = 'legacy_ir_codes_json_import_v1';
const SUPPORTED_PROTOCOLS = new Set(['COOLIX', 'NEC', 'SONY', 'SAMSUNG', 'RC5']);

function normalizeHexCode(value) {
  const raw = String(value || '').trim().replace(/^(?:0x)+/i, '');
  if (!raw || !/^[0-9a-f]+$/i.test(raw)) {
    throw new Error('红外码必须是十六进制数据');
  }
  return `0x${raw.toUpperCase()}`;
}

function normalizeCodeProfile(codeData) {
  if (!codeData || typeof codeData !== 'object') throw new Error('缺少红外码数据');
  const protocol = String(codeData.protocol || '').trim().toUpperCase();
  if (!SUPPORTED_PROTOCOLS.has(protocol)) {
    throw new Error(`暂不支持红外协议: ${protocol || 'unknown'}`);
  }
  const bits = Number(codeData.bits);
  if (!Number.isInteger(bits) || bits <= 0 || bits > 1024) throw new Error('红外码位数无效');
  return {
    protocol,
    code: normalizeHexCode(codeData.code),
    bits,
    learnedAt: codeData.learnedAt || new Date().toISOString()
  };
}

function isCodeProfile(value) {
  return Boolean(value && typeof value === 'object' && value.protocol && value.code && value.bits);
}

function rowToProfile(row) {
  return {
    protocol: row.protocol,
    code: row.code,
    bits: row.bits,
    learnedAt: row.learned_at
  };
}

function variantKey(action, value, options = {}) {
  if (action !== 'set_temperature') return 'default';
  if (options.legacy) return 'legacy';
  return `value:${Number(value)}`;
}

function upsertCode(db, deviceId, action, key, codeData) {
  const profile = normalizeCodeProfile(codeData);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO ir_codes (
      device_id, action, variant_key, protocol, code, bits, learned_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(device_id, action, variant_key) DO UPDATE SET
      protocol = excluded.protocol,
      code = excluded.code,
      bits = excluded.bits,
      learned_at = excluded.learned_at,
      updated_at = excluded.updated_at
  `).run(deviceId, action, key, profile.protocol, profile.code, profile.bits, profile.learnedAt, now);
  return profile;
}

function importLegacyStore(db, input) {
  let imported = 0;
  for (const [deviceId, actions] of Object.entries(input || {})) {
    const deviceExists = db.prepare('SELECT 1 AS found FROM devices WHERE id = ?').get(deviceId);
    if (!deviceExists) {
      console.warn(`忽略无对应设备的旧红外码：${deviceId}`);
      continue;
    }
    for (const [action, value] of Object.entries(actions || {})) {
      try {
        if (action !== 'set_temperature') {
          upsertCode(db, deviceId, action, 'default', value);
          imported += 1;
          continue;
        }
        if (isCodeProfile(value)) {
          upsertCode(db, deviceId, action, 'legacy', value);
          imported += 1;
          continue;
        }
        const variants = value?.variants || value || {};
        for (const [temperature, profile] of Object.entries(variants)) {
          if (!isCodeProfile(profile) || !Number.isInteger(Number(temperature))) continue;
          upsertCode(db, deviceId, action, `value:${Number(temperature)}`, profile);
          imported += 1;
        }
        if (isCodeProfile(value?.legacy)) {
          upsertCode(db, deviceId, action, 'legacy', value.legacy);
          imported += 1;
        }
      } catch (error) {
        console.warn(`忽略无效旧红外码 ${deviceId}/${action}: ${error.message}`);
      }
    }
  }
  return imported;
}

function load() {
  const db = getDatabase();
  if (getMetadata(LEGACY_IMPORT_KEY)) return getAllCodes();

  let legacyStore = {};
  if (fs.existsSync(LEGACY_STORE_PATH)) {
    try {
      legacyStore = JSON.parse(fs.readFileSync(LEGACY_STORE_PATH, 'utf8'));
    } catch (error) {
      console.error(`旧红外码数据导入失败：${error.message}`);
    }
  }

  let imported = 0;
  transaction((transactionDb) => {
    const count = Number(transactionDb.prepare('SELECT COUNT(*) AS count FROM ir_codes').get().count);
    if (count === 0) imported = importLegacyStore(transactionDb, legacyStore);
    transactionDb.prepare(`
      INSERT INTO app_metadata (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(LEGACY_IMPORT_KEY, 'completed', new Date().toISOString());
  });
  if (imported) console.log(`已将 ${imported} 个旧红外码导入 SQLite`);
  return getAllCodes();
}

function getCode(deviceId, action, value) {
  if (action === 'set_temperature' && !Number.isInteger(Number(value))) return null;
  const row = getDatabase().prepare(`
    SELECT * FROM ir_codes WHERE device_id = ? AND action = ? AND variant_key = ?
  `).get(deviceId, action, variantKey(action, value));
  return row ? rowToProfile(row) : null;
}

function getAllCodes() {
  const result = {};
  const rows = getDatabase().prepare(`
    SELECT * FROM ir_codes ORDER BY device_id, action, variant_key
  `).all();
  for (const row of rows) {
    if (!result[row.device_id]) result[row.device_id] = {};
    const profile = rowToProfile(row);
    if (row.action !== 'set_temperature') {
      result[row.device_id][row.action] = profile;
      continue;
    }
    if (!result[row.device_id][row.action]) {
      result[row.device_id][row.action] = { variants: {}, legacy: null };
    }
    if (row.variant_key === 'legacy') {
      result[row.device_id][row.action].legacy = profile;
    } else if (row.variant_key.startsWith('value:')) {
      result[row.device_id][row.action].variants[row.variant_key.slice(6)] = profile;
    }
  }
  return result;
}

function setCode(deviceId, action, codeData, value) {
  if (action === 'set_temperature' && !Number.isInteger(Number(value))) {
    throw new Error('保存调温红外码时必须指定温度');
  }
  return upsertCode(getDatabase(), deviceId, action, variantKey(action, value), codeData);
}

function deleteCode(deviceId, action, value, options = {}) {
  const key = variantKey(action, value, options);
  const result = getDatabase().prepare(`
    DELETE FROM ir_codes WHERE device_id = ? AND action = ? AND variant_key = ?
  `).run(deviceId, action, key);
  return result.changes > 0;
}

function mergeIntoDevices(devices) {
  const allCodes = getAllCodes();
  for (const device of devices) {
    if (!device.irProfile) device.irProfile = {};
    device.irProfile.learnedCodes = allCodes[device.id] || {};
  }
}

module.exports = {
  deleteCode,
  getAllCodes,
  getCode,
  load,
  mergeIntoDevices,
  normalizeCodeProfile,
  setCode
};
