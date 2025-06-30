const axios = require('axios')

// Internal cache: deviceId -> { data, timestamp }
const statusCache = new Map()

// Retry helper with exponential backoff for 429 errors
async function retry(fn, retries = 3, delay = 500) {
    try {
        return await fn()
    } catch (err) {
        if (retries > 0 && err.response?.status === 429) {
            await new Promise(r => setTimeout(r, delay))
            return retry(fn, retries - 1, delay * 2)
        }
        throw err
    }
}

// Cached status fetch (TTL ms)
async function getStatusCached(token, deviceId, ttl = 5000) {
    const now = Date.now()
    const entry = statusCache.get(deviceId)
    if (entry && now - entry.timestamp < ttl) {
        return entry.data
    }
    const res = await retry(() =>
        axios.get(
            `https://api.smartthings.com/v1/devices/${deviceId}/status`,
            { headers: { Authorization: `Bearer ${token}` } }
        )
    )
    statusCache.set(deviceId, { data: res.data, timestamp: now })
    return res.data
}

module.exports = { retry, getStatusCached }