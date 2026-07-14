const express = require('express');
const {
  clearLoginFailures,
  clearSessionCookie,
  credentialsMatch,
  getLoginBlock,
  getSession,
  getUsername,
  isAuthConfigured,
  recordLoginFailure,
  setSessionCookie
} = require('../auth');

const router = express.Router();

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.get('/status', (req, res) => {
  const session = getSession(req);
  res.json({
    configured: isAuthConfigured(),
    authenticated: Boolean(session),
    user: session ? { username: session.username } : null
  });
});

router.post('/login', (req, res) => {
  if (!isAuthConfigured()) {
    return res.status(503).json({ error: 'authentication_not_configured', message: '控制台登录尚未安全配置' });
  }

  const blocked = getLoginBlock(req);
  if (blocked) {
    res.setHeader('Retry-After', String(blocked.retryAfterSeconds));
    return res.status(429).json({ error: 'too_many_attempts', message: `登录失败次数过多，请在 ${blocked.retryAfterSeconds} 秒后重试` });
  }

  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!credentialsMatch(username, password)) {
    const newBlock = recordLoginFailure(req);
    if (newBlock) res.setHeader('Retry-After', String(newBlock.retryAfterSeconds));
    return res.status(newBlock ? 429 : 401).json({
      error: newBlock ? 'too_many_attempts' : 'invalid_credentials',
      message: newBlock ? '登录失败次数过多，请稍后重试' : '用户名或密码错误'
    });
  }

  clearLoginFailures(req);
  setSessionCookie(req, res);
  return res.json({ authenticated: true, user: { username: getUsername() } });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ authenticated: false, user: null });
});

module.exports = router;
