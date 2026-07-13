const express = require('express');
const { reloadDevices } = require('../devices');
const {
  getAll,
  add,
  update,
  remove,
  TYPE_PRESETS
} = require('../deviceStore');

const router = express.Router();

router.get('/types', (req, res) => res.json(TYPE_PRESETS));
router.get('/', (req, res) => res.json(getAll()));

router.post('/', (req, res) => {
  const { id, name, type, location } = req.body;
  if (!id || !name) return res.status(400).json({ success: false, message: '缺少 id 或 name 字段。' });
  if (!/^[a-z0-9_]+$/.test(id)) {
    return res.status(400).json({ success: false, message: '设备 ID 只能包含小写字母、数字和下划线。' });
  }
  const result = add({ id, name, type: type || 'other', location: location || '' });
  if (!result.success) return res.status(409).json(result);
  reloadDevices();
  return res.json({ success: true, device: result.device });
});

router.put('/:id', (req, res) => {
  const result = update(req.params.id, req.body);
  if (!result.success) return res.status(404).json(result);
  reloadDevices();
  return res.json({ success: true, device: result.device });
});

router.delete('/:id', (req, res) => {
  const result = remove(req.params.id);
  if (!result.success) return res.status(404).json(result);
  reloadDevices();
  return res.json({ success: true, message: '已删除。' });
});

module.exports = router;
