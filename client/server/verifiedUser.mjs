import {createHash} from 'node:crypto'
import {Buffer} from 'node:buffer'

// Decode only to bound a previously server-verified result. Decoded claims never
// authorize a request: every cache entry starts with a successful Auth /user call.
function tokenClaims(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch { return null }
}

export function createUserVerifier({fetchImpl = (...args) => fetch(...args), now = Date.now, ttlMs = 60000, maxEntries = 128} = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs < 0 || ttlMs > 60000 || !Number.isInteger(maxEntries) || maxEntries < 1) throw Error('Invalid Auth cache limits')
  const entries = new Map()
  return async function verifyUser({authUrl, authAnonKey}, token, {readOnly = false} = {}) {
    if (typeof token !== 'string' || !token || token.length > 4096) return null
    if (!authUrl || !authAnonKey) throw Error('Farmplast Auth not configured')
    const key = createHash('sha256').update(JSON.stringify([authUrl, authAnonKey, token])).digest('hex')
    const claims = tokenClaims(token)
    const expiry = Number.isSafeInteger(claims?.exp) ? claims.exp * 1000 : null
    const time = now()
    if (expiry !== null && expiry <= time) { entries.delete(key); return null }
    for (const [id, entry] of entries) if (!entry.pending && entry.until <= time) entries.delete(id)
    const cached = entries.get(key)
    if (readOnly && cached?.user && cached.until > time) return cached.user
    if (readOnly && cached?.pending) return cached.pending

    // Fresh operations never join an in-flight read verification. Replacing the
    // entry also prevents an older read from repopulating it after a rejection.
    const entry = {}
    entries.delete(key)
    while (entries.size >= maxEntries) entries.delete(entries.keys().next().value)
    entries.set(key, entry)
    const pending = (async () => {
      try {
        const response = await fetchImpl(authUrl + '/auth/v1/user', {
          headers: {apikey: authAnonKey, Authorization: 'Bearer ' + token},
          signal: AbortSignal.timeout(7000), redirect: 'error', cache: 'no-store',
        })
        const user = response.ok ? await response.json().catch(() => null) : null
        if (!user?.id || typeof user.id !== 'string') {
          if (entries.get(key) === entry) entries.delete(key)
          return null
        }
        const verified = Object.freeze({id: user.id})
        const eligible = expiry !== null && claims.sub === user.id && claims.iss === authUrl + '/auth/v1'
          && (claims.aud === 'authenticated' || Array.isArray(claims.aud) && claims.aud.includes('authenticated'))
        const until = eligible ? Math.min(now() + ttlMs, expiry) : 0
        if (entries.get(key) === entry) {
          if (until > now()) { entry.user = verified; entry.until = until }
          else entries.delete(key)
        }
        return verified
      } catch (error) {
        if (entries.get(key) === entry) entries.delete(key)
        throw error
      } finally { delete entry.pending }
    })()
    entry.pending = pending
    return pending
  }
}

export const verifyFarmplastUser = createUserVerifier()
