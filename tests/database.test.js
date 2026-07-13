const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-home-ai-db-'));
const databasePath = path.join(testDir, 'smart-home.test.db');
const legacyDevicesPath = path.join(testDir, 'devices.json');
const legacyCodesPath = path.join(testDir, 'ir_codes.json');

fs.writeFileSync(legacyDevicesPath, JSON.stringify([{
  id: 'legacy_ac',
  name: '测试空调',
  type: 'air_conditioner',
  location: '测试房间',
  controlType: 'ir',
  paired: true
}], null, 2));
fs.writeFileSync(legacyCodesPath, JSON.stringify({
  legacy_ac: {
    turn_on: { protocol: 'COOLIX', code: '0xB21FB8', bits: 24 }
  }
}, null, 2));

process.env.DATABASE_PATH = databasePath;
process.env.DEVICE_STORE_PATH = legacyDevicesPath;
process.env.IR_CODE_STORE_PATH = legacyCodesPath;

const database = require('../backend/database');
const deviceStore = require('../backend/deviceStore');
const irCodeStore = require('../backend/irCodeStore');
const commandEventStore = require('../backend/commandEventStore');
const modelConfigStore = require('../backend/modelConfigStore');

test('旧 JSON 数据只导入一次并持久化到 SQLite', () => {
  deviceStore.load();
  irCodeStore.load();

  assert.equal(deviceStore.getById('legacy_ac').name, '测试空调');
  assert.equal(irCodeStore.getCode('legacy_ac', 'turn_on').code, '0xB21FB8');

  fs.writeFileSync(legacyDevicesPath, '[]');
  fs.writeFileSync(legacyCodesPath, '{}');
  database.closeDatabase();

  deviceStore.load();
  irCodeStore.load();
  assert.equal(deviceStore.getById('legacy_ac').name, '测试空调');
  assert.equal(irCodeStore.getCode('legacy_ac', 'turn_on').code, '0xB21FB8');
});

test('运行状态、红外码和执行事件可以持久化', () => {
  const added = deviceStore.add({
    id: 'test_lamp',
    name: '测试灯',
    type: 'light',
    location: '测试房间'
  });
  assert.equal(added.success, true);

  assert.equal(deviceStore.saveRuntimeState('test_lamp', {
    status: 'on',
    assumedState: 'on',
    stateConfidence: 'assumed',
    lastCommand: { command: 'turn_on' }
  }), true);
  irCodeStore.setCode('test_lamp', 'turn_on', {
    protocol: 'NEC',
    code: '0x00FF00FF',
    bits: 32
  });
  commandEventStore.recordCommandEvent({
    deviceId: 'test_lamp',
    deviceName: '测试灯',
    command: 'turn_on',
    source: 'test',
    success: true,
    message: '测试成功',
    stateConfidence: 'assumed'
  });

  database.closeDatabase();

  const runtime = deviceStore.getAllRuntimeStates().find(item => item.deviceId === 'test_lamp');
  assert.equal(runtime.status, 'on');
  assert.equal(runtime.lastCommand.command, 'turn_on');
  assert.equal(irCodeStore.getCode('test_lamp', 'turn_on').code, '0x00FF00FF');
  assert.equal(commandEventStore.getRecentCommandEvents(1)[0].message, '测试成功');

  assert.equal(deviceStore.remove('test_lamp').success, true);
  assert.equal(irCodeStore.getCode('test_lamp', 'turn_on'), null);
});

test('模型配置写入 SQLite 且公开接口不返回 API Key', () => {
  const saved = modelConfigStore.saveModelConfigs({
    llm: {
      enabled: true,
      provider: 'test-provider',
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret-test-key',
      model: 'test-model',
      settings: { timeoutMs: 5000, maxCompletionTokens: 512, temperature: 0.3 }
    },
    asr: {
      enabled: true,
      provider: 'test-provider',
      baseUrl: 'https://example.com/v1',
      apiKey: 'asr-secret',
      model: 'test-asr',
      settings: { language: 'zh', timeoutMs: 10000 }
    }
  });

  assert.equal(saved.llm.apiKey, '');
  assert.equal(saved.llm.apiKeyConfigured, true);
  assert.equal(modelConfigStore.getModelConfig('llm').apiKey, 'secret-test-key');
  assert.equal(database.getDatabase().prepare('PRAGMA user_version').get().user_version, 4);

  database.closeDatabase();
  assert.equal(modelConfigStore.getModelConfig('llm').model, 'test-model');
});

test.after(() => {
  database.closeDatabase();
  fs.rmSync(testDir, { recursive: true, force: true });
});
