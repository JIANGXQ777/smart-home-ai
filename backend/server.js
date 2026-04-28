const express = require("express");
const app = express();

// 允许跨域
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// 模拟设备
app.get("/air_on", (req, res) => {
  console.log("✅ 空调已打开（模拟）");
  res.send("OK");
});

// AI判断
app.get("/ai", (req, res) => {
  const text = req.query.text;

  let action = "none";

  if (text && text.includes("热")) {
    action = "air_on";
  }

  res.json({ action });
});

app.listen(5000, () => {
  console.log("🚀 服务器运行：http://localhost:5000");
});
