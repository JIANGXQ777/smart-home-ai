require('dotenv').config({ quiet: true });

const express = require('express');
const path = require('path');
const { initializeEsp32Connections } = require('./esp32Client');
const { TYPE_PRESETS } = require('./deviceStore');
const { refreshLlmHealth } = require('./services/stateService');
const { closeDatabase, DATABASE_PATH, getDatabase } = require('./database');

const stateRouter = require('./routes/state');
const chatRouter = require('./routes/chat');
const executeRouter = require('./routes/execute');
const configRouter = require('./routes/config');
const devicesRouter = require('./routes/devices');
const irLearningRouter = require('./routes/irLearning');
const eventsRouter = require('./routes/events');
const voiceRouter = require('./routes/voice');
const modelsRouter = require('./routes/models');
const authRouter = require('./routes/auth');
const { requireAuth } = require('./auth');

const app = express();
const port = Number(process.env.PORT || 5000);
const frontendDir = path.join(__dirname, '..', 'frontend', 'dist');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.header('Referrer-Policy', 'no-referrer');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  return next();
});

app.use('/api/auth', authRouter);
app.get('/api/health', (req, res) => {
  getDatabase().prepare('SELECT 1 AS ok').get();
  res.json({ ok: true, storage: 'sqlite', timestamp: new Date().toISOString() });
});
app.use('/api', requireAuth);
app.use('/api/state', stateRouter);
app.use('/api/chat', chatRouter);
app.use('/api/execute', executeRouter);
app.use('/api/config', configRouter);
app.use('/api/devices', devicesRouter);
app.get('/api/device-types', (req, res) => res.json(TYPE_PRESETS));
app.use('/api/ir-learn', irLearningRouter);
app.use('/api/events', eventsRouter);
app.use('/api/voice', voiceRouter);
app.use('/api/models', modelsRouter);

app.use(express.static(frontendDir));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(frontendDir, 'index.html'));
});

const httpServer = app.listen(port, () => {
  console.log(`服务器运行：http://localhost:${port}`);
  console.log(`SQLite 数据库：${DATABASE_PATH}`);
  console.log('API 已加载：state / chat / execute / config / models / devices / ir-learn');

  refreshLlmHealth().catch(() => {});
  setInterval(() => refreshLlmHealth().catch(() => {}), 60000);
});

initializeEsp32Connections(httpServer).catch((error) => {
  console.log(`ESP32 连接初始化失败（系统将继续运行）：${error.message}`);
});

function shutdown(signal) {
  console.log(`收到 ${signal}，正在关闭服务...`);
  httpServer.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
