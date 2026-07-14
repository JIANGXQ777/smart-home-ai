const crypto = require('crypto');

const COOKIE_NAME = 'smart_home_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const loginAttempts = new Map();

function getUsername() {
  return String(process.env.APP_AUTH_USERNAME || 'admin').trim();
}

function getPassword() {
  return String(process.env.APP_AUTH_PASSWORD || '');
}

function getSessionSecret() {
  const configured = String(process.env.APP_SESSION_SECRET || '');
  if (configured.length >= 32) return configured;
  return crypto.createHash('sha256').update(`smart-home-ai:${getPassword()}`).digest('hex');
}

function isAuthConfigured() {
  return getUsername().length > 0
    && getPassword().length >= 16
    && String(process.env.APP_SESSION_SECRET || '').length >= 32;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function credentialsMatch(username, password) {
  return isAuthConfigured() && safeEqual(username, getUsername()) && safeEqual(password, getPassword());
}

function sign(value) {
  return crypto.createHmac('sha256', getSessionSecret()).update(value).digest('base64url');
}

function createSessionToken(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    sub: getUsername(),
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token, now = Date.now()) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.sub !== getUsername() || !Number.isFinite(data.exp) || data.exp <= Math.floor(now / 1000)) return null;
    return { username: data.sub, expiresAt: new Date(data.exp * 1000).toISOString() };
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    try { cookies[name] = decodeURIComponent(value); } catch { cookies[name] = value; }
  }
  return cookies;
}

function getSession(req) {
  return verifySessionToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);
}

function isHttpsRequest(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function sessionCookie(req, token, maxAge = SESSION_TTL_SECONDS) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`;
}

function setSessionCookie(req, res) {
  res.setHeader('Set-Cookie', sessionCookie(req, createSessionToken()));
}

function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
}

function attemptKey(req) {
  return req.socket.remoteAddress || 'gateway';
}

function getLoginBlock(req, now = Date.now()) {
  const entry = loginAttempts.get(attemptKey(req));
  if (!entry) return null;
  if (entry.blockedUntil > now) return { retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000) };
  if (entry.windowStartedAt + LOGIN_WINDOW_MS <= now) loginAttempts.delete(attemptKey(req));
  return null;
}

function recordLoginFailure(req, now = Date.now()) {
  const key = attemptKey(req);
  const previous = loginAttempts.get(key);
  const entry = !previous || previous.windowStartedAt + LOGIN_WINDOW_MS <= now
    ? { count: 0, windowStartedAt: now, blockedUntil: 0 }
    : previous;
  entry.count += 1;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) entry.blockedUntil = now + LOGIN_BLOCK_MS;
  loginAttempts.set(key, entry);
  return getLoginBlock(req, now);
}

function clearLoginFailures(req) {
  loginAttempts.delete(attemptKey(req));
}

function requireAuth(req, res, next) {
  if (!isAuthConfigured()) {
    return res.status(503).json({ error: 'authentication_not_configured', message: '控制台登录尚未安全配置' });
  }
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'authentication_required', message: '请先登录' });
  req.authUser = session;
  return next();
}

module.exports = {
  clearLoginFailures,
  clearSessionCookie,
  createSessionToken,
  credentialsMatch,
  getLoginBlock,
  getSession,
  getUsername,
  isAuthConfigured,
  recordLoginFailure,
  requireAuth,
  setSessionCookie,
  verifySessionToken
};
