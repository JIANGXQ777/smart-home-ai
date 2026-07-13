const express = require('express');
const { decide } = require('../aiAgent');

const router = express.Router();

router.post('/', async (req, res) => {
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: '缺少 message 字段。' });

  try {
    return res.json(await decide(message));
  } catch (error) {
    console.error('AI 决策失败:', error);
    return res.status(500).json({
      reply: '抱歉，AI 决策服务暂时不可用。',
      intent: 'error',
      needConfirm: false,
      action: null
    });
  }
});

module.exports = router;
