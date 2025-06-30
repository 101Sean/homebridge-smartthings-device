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

module.exports = { retry }