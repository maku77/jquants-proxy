/**
 * Default cache TTL in seconds.
 */
const CACHE_MAX_AGE = 60 * 10; // 10 minutes

/**
 * Response header key for the maximum age of the proxy cache.
 *
 * This is useful for debugging cache behavior.
 */
const X_PROXY_CACHE_MAXAGE_KEY = "x-proxy-cache-maxage";

/**
 * Response header key for the age of the proxy cache.
 *
 * This is useful for debugging cache behavior.
 */
const X_PROXY_CACHE_AGE_KEY = "x-proxy-cache-age";

type Req = RequestInfo | URL;

/**
 * Retrieve a response object from the cache.
 */
export async function getCache(req: Req): Promise<Response | undefined> {
	// Check if the request is in the cache
	const cache = await caches.default.match(req);
	if (!cache) {
		return undefined;
	}

	// Create a new response object to modify the headers
	const res = new Response(cache.body, cache);
	res.headers.delete("Cache-Control");
	setDebugHeaders(res);

	return res;
}

/**
 * Store a response object in the cache.
 */
export function putCache(c: ExecutionContext, req: Req, res: Response): void {
	// To enable caching, add a "Cache-Control" header to the response.
	const clone = res.clone();
	const newRes = new Response(clone.body, clone);
	newRes.headers.set("Cache-Control", `public, s-maxage=${CACHE_MAX_AGE}`);

	// Use waitUntil to prevent the worker from being killed
	c.waitUntil(caches.default.put(req, newRes));
}

/**
 * Purge the cache for the specified request.
 */
export function deleteCache(c: ExecutionContext, req: Req): void {
	c.waitUntil(caches.default.delete(req));
}

function setDebugHeaders(res: Response): void {
	// Set the age of the cache
	const date = res.headers.get("date");
	if (date) {
		const age = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
		res.headers.set(X_PROXY_CACHE_AGE_KEY, age.toString());
	}

	// Set the maximum age of the cache
	res.headers.set(X_PROXY_CACHE_MAXAGE_KEY, CACHE_MAX_AGE.toString());
}
