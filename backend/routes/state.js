const express = require('express');
const { buildStateResponse } = require('../services/stateService');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    res.json(await buildStateResponse());
  } catch (error) {
    console.error('State aggregation failed:', error);
    res.status(500).json({ error: '状态聚合失败。' });
  }
});

module.exports = router;
