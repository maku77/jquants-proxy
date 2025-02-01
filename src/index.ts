import { WorkerEntrypoint } from "cloudflare:workers";
import { getCache, putCache } from "./cache";

export interface Env {
	KV: KVNamespace;
	JQUANTS_API_EMAIL: string;
	JQUANTS_API_PW: string;
}

/**
 * JQuants API のベース URL。
 */
const API_BASE_URL = "https://api.jquants.com";

/**
 * JQuants API のリフレッシュトークンの有効期間。
 *
 * 実際には 7 日間ですが、それよりも短い期間でトークンを再取得するようにします。
 * - https://jpx.gitbook.io/j-quants-ja/api-reference/refreshtoken
 */
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 6; // 6 days

/**
 * JQuants API の ID トークンの有効期間。
 *
 * 実際には 24 時間ですが、それよりも短い期間でトークンを再取得するようにします。
 * - https://jpx.gitbook.io/j-quants-ja/api-reference/idtoken
 */
const ID_TOKEN_TTL = 60 * 60 * 23; // 23 hours

export default class extends WorkerEntrypoint<Env> {
	/**
	 * Endpoint is a last part of the URL to call JQuants API.
	 *
	 * - e.g. "/v1/fins/statements?code=86970&date=20230130"
	 */
	async get(endpoint: string): Promise<Response> {
		this.#checkConfig();
		return this.#fetchWithCache(API_BASE_URL + endpoint);
	}

	async fetch(): Promise<Response> {
		return Response.json({ message: "JQuants API proxy is running" });
	}

	async #fetchWithCache(url: string): Promise<Response> {
		// キャッシュに Response オブジェクトがあればそれを返す
		let res = await getCache(url);
		if (res) return res;

		// アクセストークンの必要な 3rd Party API の呼び出し
		const token = await this.#getToken();
		res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

		// キャッシュに Response オブジェクトを保存
		if (res.ok) putCache(this.ctx, url, res);
		return res;
	}

	#checkConfig() {
		if (!this.env.JQUANTS_API_EMAIL || !this.env.JQUANTS_API_PW) {
			throw new Error("JQUANTS_API_EMAIL or JQUANTS_API_PW is not set");
		}
	}

	/**
	 * JQuants API の ID トークンを取得します。
	 *
	 * KV にキャッシュされている場合はそちらを使用します。
	 */
	async #getToken(): Promise<string> {
		const ID_TOKEN_KEY = "id_token"; // KV のキー
		const refreshToken = await this.#getRefreshToken();

		// KV に ID トークンが保存されている場合はそれを返す
		const cachedToken = await this.env.KV.get(ID_TOKEN_KEY);
		if (cachedToken) {
			console.debug("Cached ID token found");
			return cachedToken;
		}

		// 保存されていない場合は新しいトークンを取得して KV に保存
		console.debug("Cached token not found, fetching new ID token");
		const newToken = await this.#getNewIdToken(refreshToken);
		await this.env.KV.put(ID_TOKEN_KEY, newToken, { expirationTtl: ID_TOKEN_TTL });
		return newToken;
	}

	/**
	 * JQuants API のリフレッシュトークンを取得します。
	 *
	 * KV にキャッシュされている場合はそちらを使用します。
	 */
	async #getRefreshToken(): Promise<string> {
		const REFRESH_TOKEN_KEY = "refresh_token"; // KV のキー

		// KV にトークンが保存されている場合はそれを返す
		const cachedToken = await this.env.KV.get(REFRESH_TOKEN_KEY);
		if (cachedToken) {
			console.debug("Cached refresh token found");
			return cachedToken;
		}

		// 保存されていない場合は新しいトークンを取得して KV に保存
		console.debug("Cached token not found, fetching new refresh token");
		const newToken = await this.#getNewRefreshToken();
		await this.env.KV.put(REFRESH_TOKEN_KEY, newToken, {
			expirationTtl: REFRESH_TOKEN_TTL,
		});
		return newToken;
	}

	/**
	 * Obtain a refresh token from JQuants API.
	 * - https://jpx.gitbook.io/j-quants-ja/api-reference/refreshtoken
	 */
	async #getNewRefreshToken(): Promise<string> {
		const data = {
			mailaddress: this.env.JQUANTS_API_EMAIL,
			password: this.env.JQUANTS_API_PW,
		};
		const res = await fetch(API_BASE_URL + "/v1/token/auth_user", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});
		const json = (await res.json()) as { refreshToken: string };
		if (!json.refreshToken) {
			throw new Error("JQuants refresh token not found in response");
		}
		return json.refreshToken;
	}

	/**
	 * Obtain a new ID token from JQuants API.
	 * - https://jpx.gitbook.io/j-quants-ja/api-reference/idtoken
	 */
	async #getNewIdToken(refreshToken: string): Promise<string> {
		const res = await fetch(API_BASE_URL + `/v1/token/auth_refresh?refreshtoken=${refreshToken}`, {
			method: "POST",
		});
		const json = (await res.json()) as { idToken: string };
		if (!json.idToken) {
			throw new Error("JQuants ID token not found in response");
		}
		return json.idToken;
	}
}
