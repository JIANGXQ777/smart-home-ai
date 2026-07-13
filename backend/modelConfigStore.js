const { getDatabase, transaction } = require('./database');

const MODEL_TYPES = ['llm', 'asr', 'tts'];

function booleanValue(value, fallback) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

function numericValue(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function endpointFromEnvironment(endpoint, legacyBaseUrl, defaultPath) {
  const direct = String(endpoint || '').trim();
  if (direct) return direct;
  const baseUrl = String(legacyBaseUrl || '').trim().replace(/\/+$/, '');
  return baseUrl ? `${baseUrl}${defaultPath}` : '';
}

function envDefaults() {
  const voiceBaseUrl = process.env.VOICE_BASE_URL || '';
  const voiceApiKey = process.env.VOICE_API_KEY || '';
  const voiceEnabled = booleanValue(process.env.VOICE_ENABLED, false);
  return {
    llm: {
      enabled: booleanValue(process.env.LLM_ENABLED, true),
      provider: process.env.LLM_PROVIDER || 'openai-compatible',
      baseUrl: endpointFromEnvironment(
        process.env.LLM_ENDPOINT,
        process.env.LLM_BASE_URL,
        '/chat/completions'
      ),
      apiKey: process.env.LLM_API_KEY || '',
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      settings: {
        timeoutMs: numericValue(process.env.LLM_TIMEOUT_MS, 15000),
        maxCompletionTokens: numericValue(process.env.LLM_MAX_COMPLETION_TOKENS, 1024),
        temperature: numericValue(process.env.LLM_TEMPERATURE, 0.2)
      }
    },
    asr: {
      enabled: voiceEnabled,
      provider: process.env.VOICE_ASR_PROVIDER || 'openai-compatible',
      baseUrl: endpointFromEnvironment(
        process.env.VOICE_ASR_ENDPOINT,
        process.env.VOICE_ASR_BASE_URL || voiceBaseUrl,
        '/audio/transcriptions'
      ),
      apiKey: process.env.VOICE_ASR_API_KEY || voiceApiKey,
      model: process.env.VOICE_STT_MODEL || 'gpt-4o-mini-transcribe',
      settings: {
        language: process.env.VOICE_ASR_LANGUAGE || 'zh',
        timeoutMs: numericValue(process.env.VOICE_TIMEOUT_MS, 30000)
      }
    },
    tts: {
      enabled: voiceEnabled,
      provider: process.env.VOICE_TTS_PROVIDER || 'openai-compatible',
      baseUrl: endpointFromEnvironment(
        process.env.VOICE_TTS_ENDPOINT,
        process.env.VOICE_TTS_BASE_URL || voiceBaseUrl,
        '/audio/speech'
      ),
      apiKey: process.env.VOICE_TTS_API_KEY || voiceApiKey,
      model: process.env.VOICE_TTS_MODEL || 'gpt-4o-mini-tts',
      settings: {
        voice: process.env.VOICE_TTS_VOICE || 'alloy',
        timeoutMs: numericValue(process.env.VOICE_TIMEOUT_MS, 30000),
        sourceSampleRate: numericValue(process.env.VOICE_TTS_SAMPLE_RATE, 24000)
      }
    }
  };
}

function ensureModelConfigs(db = getDatabase()) {
  const defaults = envDefaults();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO model_configs
      (type, enabled, provider, base_url, api_key, model, settings_json, created_at, updated_at)
    VALUES
      (@type, @enabled, @provider, @baseUrl, @apiKey, @model, @settingsJson, @createdAt, @updatedAt)
  `);
  const now = new Date().toISOString();
  for (const type of MODEL_TYPES) {
    const value = defaults[type];
    insert.run({
      type,
      enabled: value.enabled ? 1 : 0,
      provider: value.provider,
      baseUrl: value.baseUrl,
      apiKey: value.apiKey,
      model: value.model,
      settingsJson: JSON.stringify(value.settings),
      createdAt: now,
      updatedAt: now
    });
  }
}

function parseSettings(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function rowToModelConfig(row) {
  if (!row) return null;
  return {
    type: row.type,
    enabled: Boolean(row.enabled),
    provider: row.provider,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    model: row.model,
    settings: parseSettings(row.settings_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getModelConfig(type) {
  if (!MODEL_TYPES.includes(type)) throw new Error(`不支持的模型类型：${type}`);
  const db = getDatabase();
  ensureModelConfigs(db);
  return rowToModelConfig(db.prepare('SELECT * FROM model_configs WHERE type = ?').get(type));
}

function getModelConfigs() {
  const db = getDatabase();
  ensureModelConfigs(db);
  const rows = db.prepare('SELECT * FROM model_configs ORDER BY type').all();
  return Object.fromEntries(rows.map((row) => [row.type, rowToModelConfig(row)]));
}

function publicModelConfig(config) {
  return {
    type: config.type,
    enabled: config.enabled,
    provider: config.provider,
    baseUrl: config.baseUrl,
    apiKey: '',
    apiKeyConfigured: Boolean(config.apiKey),
    model: config.model,
    settings: config.settings,
    updatedAt: config.updatedAt
  };
}

function getPublicModelConfigs() {
  const configs = getModelConfigs();
  return Object.fromEntries(MODEL_TYPES.map((type) => [type, publicModelConfig(configs[type])]));
}

function validateText(field, value, maxLength, allowEmpty = false) {
  const text = String(value ?? '').trim();
  if (!allowEmpty && !text) throw new Error(`${field}不能为空`);
  if (/\r|\n/.test(text)) throw new Error(`${field}不能包含换行符`);
  if (text.length > maxLength) throw new Error(`${field}长度不能超过 ${maxLength} 个字符`);
  return text;
}

function validateUrl(field, value) {
  const text = validateText(field, value, 2048);
  let url;
  try {
    url = new URL(text);
  } catch (error) {
    throw new Error(`${field}格式无效`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${field}只允许 http 或 https`);
  return text.replace(/\/+$/, '');
}

function integerSetting(field, value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${field}必须是 ${min}-${max} 之间的整数`);
  }
  return number;
}

function normalizeSettings(type, settings, current) {
  const value = { ...current, ...(settings || {}) };
  value.timeoutMs = integerSetting('请求超时时间', value.timeoutMs, 1000, 120000);
  if (type === 'llm') {
    value.maxCompletionTokens = integerSetting('最大 Token 数', value.maxCompletionTokens, 1, 32768);
    const temperature = Number(value.temperature);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      throw new Error('温度参数必须在 0-2 之间');
    }
    value.temperature = temperature;
  } else if (type === 'asr') {
    value.language = validateText('识别语言', value.language || 'zh', 32);
  } else if (type === 'tts') {
    value.voice = validateText('TTS 音色', value.voice || 'alloy', 64);
    value.sourceSampleRate = integerSetting('TTS 源采样率', value.sourceSampleRate, 8000, 48000);
  }
  return value;
}

function normalizeModelConfig(type, input, current) {
  const enabled = input.enabled === undefined ? current.enabled : Boolean(input.enabled);
  const apiKeyInput = input.apiKey;
  const apiKey = input.clearApiKey
    ? ''
    : apiKeyInput === undefined || apiKeyInput === ''
      ? current.apiKey
      : validateText('API Key', apiKeyInput, 4096);
  const baseUrlInput = String(input.baseUrl ?? current.baseUrl ?? '').trim();
  if (enabled && !baseUrlInput) throw new Error(`${type.toUpperCase()} 请求接口不能为空`);
  return {
    type,
    enabled,
    provider: validateText('服务商', input.provider ?? current.provider, 64),
    baseUrl: baseUrlInput ? validateUrl('请求接口', baseUrlInput) : '',
    apiKey,
    model: validateText('模型名称', input.model ?? current.model, 128),
    settings: normalizeSettings(type, input.settings, current.settings)
  };
}

function writeModelConfig(db, config) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE model_configs
    SET enabled = @enabled,
        provider = @provider,
        base_url = @baseUrl,
        api_key = @apiKey,
        model = @model,
        settings_json = @settingsJson,
        updated_at = @updatedAt
    WHERE type = @type
  `).run({
    type: config.type,
    enabled: config.enabled ? 1 : 0,
    provider: config.provider,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    settingsJson: JSON.stringify(config.settings),
    updatedAt: now
  });
}

function saveModelConfigs(updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('模型配置格式无效');
  }
  transaction((db) => {
    ensureModelConfigs(db);
    for (const type of MODEL_TYPES) {
      if (updates[type] === undefined) continue;
      const current = rowToModelConfig(db.prepare('SELECT * FROM model_configs WHERE type = ?').get(type));
      writeModelConfig(db, normalizeModelConfig(type, updates[type], current));
    }
  });
  return getPublicModelConfigs();
}

function saveModelConfig(type, update) {
  return saveModelConfigs({ [type]: update })[type];
}

module.exports = {
  MODEL_TYPES,
  getModelConfig,
  getModelConfigs,
  getPublicModelConfigs,
  saveModelConfig,
  saveModelConfigs
};
