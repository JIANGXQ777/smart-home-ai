const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-home-ai-config-'));
const envPath = path.join(testDir, '.env');
fs.writeFileSync(envPath, 'APP_MODE=demo\nLLM_ENABLED=false\n', 'utf8');
process.env.CONFIG_ENV_PATH = envPath;

const { saveConfig } = require('../backend/services/configService');

test('配置保存拒绝换行注入和无效范围', () => {
  assert.throws(() => saveConfig({
    appMode: 'hybrid',
    serialPort: 'COM3\nINJECTED=true'
  }), /不能包含换行符/);
  assert.throws(() => saveConfig({
    appMode: 'hybrid',
    voiceVadThreshold: 10
  }), /50-10000/);
});

test('合法配置通过临时文件原子替换保存', () => {
  const config = saveConfig({
    appMode: 'hybrid',
    esp32Enabled: false,
    esp32Transport: 'auto',
    serialPort: 'COM3',
    serialBaudRate: 115200,
    voiceEnabled: true,
    voiceVadThreshold: 800,
    voiceSilenceMs: 650
  });
  assert.equal(config.appMode, 'hybrid');
  const content = fs.readFileSync(envPath, 'utf8');
  assert.match(content, /VOICE_VAD_THRESHOLD=800/);
  assert.equal(fs.readdirSync(testDir).filter(name => name.endsWith('.tmp')).length, 0);
});

test.after(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});
