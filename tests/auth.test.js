const assert = require('node:assert/strict');
const test = require('node:test');

process.env.APP_AUTH_USERNAME = 'test-admin';
process.env.APP_AUTH_PASSWORD = 'test-password-with-enough-length';
process.env.APP_SESSION_SECRET = 'test-session-secret-that-is-long-enough-for-hmac';

const {
  createSessionToken,
  credentialsMatch,
  isAuthConfigured,
  verifySessionToken
} = require('../backend/auth');

test('登录凭据使用常量时间比较并拒绝错误密码', () => {
  assert.equal(isAuthConfigured(), true);
  assert.equal(credentialsMatch('test-admin', 'test-password-with-enough-length'), true);
  assert.equal(credentialsMatch('test-admin', 'wrong-password'), false);
  assert.equal(credentialsMatch('wrong-user', 'test-password-with-enough-length'), false);
});

test('会话令牌可验证、可过期并拒绝篡改', () => {
  const now = Date.now();
  const token = createSessionToken(now);
  assert.equal(verifySessionToken(token, now + 1000).username, 'test-admin');
  assert.equal(verifySessionToken(`${token}tampered`, now + 1000), null);
  assert.equal(verifySessionToken(token, now + 8 * 24 * 60 * 60 * 1000), null);
});
