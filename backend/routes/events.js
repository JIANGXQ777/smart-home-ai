const express = require('express');
const { getRecentCommandEvents } = require('../commandEventStore');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    res.json(getRecentCommandEvents(limit));
  } catch (error) {
    console.error('读取执行记录失败:', error);
    res.status(500).json({ message: '执行记录暂时不可用。' });
  }
});

module.exports = router;
