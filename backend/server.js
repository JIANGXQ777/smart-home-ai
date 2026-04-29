// 后端主服务
// 实现三个核心 API 接口

const express = require("express");
const app = express();

// 引入各模块
const { getDevices, getEnvironment } = require('./devices');
const { decide } = require('./aiAgent');
const { execute } = require('./executor');

// 解析 JSON 请求体
app.use(express.json());

// 允许跨域
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ============================================
// 接口 1: GET /api/state
// 获取当前系统状态（环境信息 + 设备列表）
// ============================================
app.get("/api/state", (req, res) => {
  const state = {
    environment: getEnvironment(),
    devices: getDevices()
  };
  res.json(state);
});

// ============================================
// 接口 2: POST /api/chat
// 接收用户输入，返回 AI 决策建议
// ============================================
app.post("/api/chat", (req, res) => {
  const { message } = req.body;

  // 校验必填字段
  if (!message) {
    return res.status(400).json({ error: "缺少 message 字段" });
  }

  // 调用 AI 决策模块
  const result = decide(message);
  res.json(result);
});

// ============================================
// 接口 3: POST /api/execute
// 用户确认后执行设备动作
// ============================================
app.post("/api/execute", (req, res) => {
  const { deviceId, command } = req.body;

  // 校验必填字段
  if (!deviceId || !command) {
    return res.status(400).json({
      success: false,
      message: "缺少 deviceId 或 command 字段"
    });
  }

  // 调用执行模块
  const result = execute(deviceId, command);
  res.json(result);
});

// 启动服务器
app.listen(5000, () => {
  console.log("🚀 服务器运行：http://localhost:5000");
  console.log("📋 API 接口：");
  console.log("   GET  /api/state    - 获取系统状态");
  console.log("   POST /api/chat     - AI 对话");
  console.log("   POST /api/execute  - 执行设备动作");
});