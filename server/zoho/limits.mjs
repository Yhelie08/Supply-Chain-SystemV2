// Request queue, deduplication, short-TTL cache, and usage meter for Zoho Creator API

const CACHE_TTL_MS = 15 * 1000; // 15 seconds default cache for read reports
const MAX_CONCURRENT = 5;       // Below Zoho's limit of 6
const MAX_PER_MINUTE = 45;      // Below Zoho's limit of 50

const cache = new Map();
const inFlight = new Map();
let activeRequests = 0;
const queue = [];
const requestTimestamps = [];

// Usage metrics for admin dashboard
export const metrics = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  throttledRetries: 0,
  errors: 0,
  lastRequestTime: null,
};

function cleanTimestamps() {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < oneMinuteAgo) {
    requestTimestamps.shift();
  }
}

function processQueue() {
  cleanTimestamps();
  if (queue.length === 0) return;
  if (activeRequests >= MAX_CONCURRENT) return;
  if (requestTimestamps.length >= MAX_PER_MINUTE) {
    const oldest = requestTimestamps[0];
    const waitMs = Math.max(100, oldest + 60 * 1000 - Date.now() + 50);
    setTimeout(processQueue, waitMs);
    return;
  }

  const { execute, resolve, reject } = queue.shift();
  activeRequests++;
  requestTimestamps.push(Date.now());
  metrics.totalRequests++;
  metrics.lastRequestTime = new Date().toISOString();

  execute()
    .then(resolve)
    .catch(reject)
    .finally(() => {
      activeRequests--;
      setTimeout(processQueue, 20);
    });
}

export function schedule(execute) {
  return new Promise((resolve, reject) => {
    queue.push({ execute, resolve, reject });
    processQueue();
  });
}

export async function cachedFetch(key, fetcher, ttl = CACHE_TTL_MS) {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && entry.expiresAt > now) {
    metrics.cacheHits++;
    return entry.value;
  }

  // Deduplicate identical in-flight requests
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  metrics.cacheMisses++;
  const promise = (async () => {
    try {
      const result = await schedule(fetcher);
      cache.set(key, { value: result, expiresAt: Date.now() + ttl });
      return result;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

export function invalidateReport(reportName) {
  if (!reportName) return;
  const target = `/report/${reportName.toLowerCase()}`;
  for (const key of cache.keys()) {
    if (key.toLowerCase().includes(target)) {
      cache.delete(key);
    }
  }
}

export function clearCache() {
  cache.clear();
}
