export async function api(path, options = {}, behavior = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 && behavior.redirectOnUnauthorized !== false && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new CustomEvent('auth:required'))
    }
    const error = new Error(data.message || data.error || `请求失败 (${response.status})`)
    error.status = response.status
    throw error
  }
  return data
}
