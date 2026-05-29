import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import type { SiteSummary } from "./types";

export type RawRecord = Record<string, unknown>;

interface UniFiConfig {
	baseUrl: string;
	apiKey: string;
	siteId?: string;
	siteInternalReference?: string;
	insecureTls: boolean;
	legacyEnabled: boolean;
	pollMs: number;
}

interface RequestOptions {
	cacheTtlMs?: number;
	timeoutMs?: number;
}

interface CollectionPage<T> {
	items: T[];
	totalCount?: number;
	count?: number;
	limit?: number;
	offset?: number;
}

const INTEGRATION_BASE_PATH = "/proxy/network/integration/v1";
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_POLL_MS = 5000;
const MAX_PAGES = 20;

const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const insecureDispatcher = new Agent({ connect: { rejectUnauthorized: false } });

export class UniFiApiError extends Error {
	status?: number;

	constructor(message: string, status?: number) {
		super(message);
		this.name = "UniFiApiError";
		this.status = status;
	}
}

function envString(name: string) {
	const value = process.env[name]?.trim();
	return value ? value : undefined;
}

function envBoolean(name: string, defaultValue: boolean) {
	const value = envString(name);
	if (!value) {
		return defaultValue;
	}

	return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function envNumber(name: string, defaultValue: number) {
	const value = Number(envString(name));
	return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function stripTrailingSlash(value: string) {
	return value.replace(/\/+$/, "");
}

export function getUniFiConfig(): UniFiConfig {
	const baseUrl = envString("UNIFI_BASE_URL");
	const apiKey = envString("UNIFI_API_KEY");

	if (!baseUrl) {
		throw new UniFiApiError("UNIFI_BASE_URL is not configured.");
	}

	if (!apiKey) {
		throw new UniFiApiError("UNIFI_API_KEY is not configured.");
	}

	return {
		baseUrl: stripTrailingSlash(baseUrl),
		apiKey,
		siteId: envString("UNIFI_SITE_ID"),
		siteInternalReference: envString("UNIFI_SITE_INTERNAL_REF"),
		insecureTls: envBoolean("UNIFI_INSECURE_TLS", true),
		legacyEnabled: envBoolean("ENABLE_UNIFI_LEGACY", false),
		pollMs: envNumber("DASHBOARD_POLL_MS", DEFAULT_POLL_MS)
	};
}

function isRecord(value: unknown): value is RawRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown) {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value.replace("%", "").trim());
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	return undefined;
}

function asString(value: unknown) {
	if (typeof value === "string" && value.trim()) {
		return value.trim();
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}

	return undefined;
}

function getFirst(record: RawRecord, keys: string[]) {
	for (const key of keys) {
		const value = record[key];
		if (value !== undefined && value !== null && value !== "") {
			return value;
		}
	}

	return undefined;
}

function unwrapDataRecord(json: unknown): RawRecord {
	if (!isRecord(json)) {
		return {};
	}

	return isRecord(json.data) ? json.data : json;
}

function collectionFromResponse<T>(json: unknown): CollectionPage<T> {
	if (Array.isArray(json)) {
		return { items: json as T[], count: json.length };
	}

	if (!isRecord(json)) {
		return { items: [] };
	}

	const candidateRecords = [json];
	const data = json.data;
	if (isRecord(data)) {
		candidateRecords.push(data);
	}

	for (const record of candidateRecords) {
		for (const key of ["data", "items", "results", "sites", "devices", "clients", "wifiBroadcasts", "broadcasts", "networks"]) {
			const value = record[key];
			if (Array.isArray(value)) {
				return {
					items: value as T[],
					totalCount: asNumber(getFirst(record, ["totalCount", "total", "total_count"])),
					count: asNumber(getFirst(record, ["count", "pageCount"])) ?? value.length,
					limit: asNumber(record.limit),
					offset: asNumber(record.offset)
				};
			}
		}
	}

	return { items: [] };
}

function withPagination(path: string, offset: number, limit: number) {
	const url = new URL(path, "http://unifi.local");
	url.searchParams.set("offset", String(offset));
	url.searchParams.set("limit", String(limit));
	return `${url.pathname}${url.search}`;
}

function safePathForError(url: URL) {
	return `${url.pathname}${url.search ? "?..." : ""}`;
}

export function toSafeErrorMessage(error: unknown) {
	if (error instanceof DOMException && error.name === "AbortError") {
		return "UniFi request timed out.";
	}

	if (error instanceof Error) {
		const cause = error.cause;
		if (error.message === "fetch failed" && cause instanceof Error) {
			return `fetch failed: ${cause.message}`;
		}

		return error.message;
	}

	return "Unknown UniFi error.";
}

export class UniFiClient {
	readonly config: UniFiConfig;

	constructor(config = getUniFiConfig()) {
		this.config = config;
	}

	get controllerHostOnly() {
		try {
			return new URL(this.config.baseUrl).host;
		} catch {
			return this.config.baseUrl.replace(/^https?:\/\//, "");
		}
	}

	private buildUrl(path: string) {
		if (/^https?:\/\//i.test(path)) {
			return new URL(path);
		}

		const normalizedPath = path.startsWith("/") ? path : `/${path}`;
		const fullPath = normalizedPath.startsWith("/proxy/") ? normalizedPath : `${INTEGRATION_BASE_PATH}${normalizedPath}`;
		return new URL(`${this.config.baseUrl}${fullPath}`);
	}

	private async requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
		const url = this.buildUrl(path);
		const cacheKey = `${this.config.baseUrl}|${url.pathname}|${url.search}`;
		const ttlMs = options.cacheTtlMs ?? 0;
		const now = Date.now();

		if (ttlMs > 0) {
			const cached = responseCache.get(cacheKey);
			if (cached && cached.expiresAt > now) {
				return cached.value as T;
			}
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

		try {
			const init: UndiciRequestInit = {
				method: "GET",
				headers: {
					Accept: "application/json",
					"X-API-KEY": this.config.apiKey
				},
				cache: "no-store",
				signal: controller.signal
			};

			if (this.config.insecureTls) {
				init.dispatcher = insecureDispatcher;
			}

			const response = await undiciFetch(url, init);
			const text = await response.text();

			if (!response.ok) {
				throw new UniFiApiError(`UniFi request failed (${response.status}) for ${safePathForError(url)}.`, response.status);
			}

			const parsed = text ? (JSON.parse(text) as T) : (null as T);

			if (ttlMs > 0) {
				responseCache.set(cacheKey, { expiresAt: now + ttlMs, value: parsed });
			}

			return parsed;
		} catch (error) {
			if (error instanceof SyntaxError) {
				throw new UniFiApiError(`UniFi returned invalid JSON for ${safePathForError(url)}.`);
			}

			if (error instanceof DOMException && error.name === "AbortError") {
				throw new UniFiApiError(`UniFi request timed out for ${safePathForError(url)}.`);
			}

			throw error;
		} finally {
			clearTimeout(timeout);
		}
	}

	async fetchPaginated<T>(path: string, limit: number, cacheTtlMs?: number) {
		const items: T[] = [];
		let offset = 0;

		for (let page = 0; page < MAX_PAGES; page += 1) {
			const pagePath = withPagination(path, offset, limit);
			const json = await this.requestJson<unknown>(pagePath, { cacheTtlMs });
			const collection = collectionFromResponse<T>(json);

			items.push(...collection.items);

			const count = collection.count ?? collection.items.length;
			const totalCount = collection.totalCount;
			offset += collection.limit ?? limit;

			if (collection.items.length === 0 || (totalCount !== undefined && items.length >= totalCount) || count < limit) {
				break;
			}
		}

		return items;
	}

	getApplicationInfo() {
		return this.requestJson<RawRecord>("/info", { cacheTtlMs: 60_000 });
	}

	getSites() {
		return this.fetchPaginated<RawRecord>("/sites", 100, 60_000);
	}

	async getSelectedSite(): Promise<SiteSummary> {
		const sites = await this.getSites();
		const configuredSiteId = this.config.siteId;
		const selected = configuredSiteId ? sites.find(site => siteIdFromRaw(site) === configuredSiteId) : sites[0];

		if (!selected) {
			if (configuredSiteId) {
				return {
					id: configuredSiteId,
					name: configuredSiteId,
					internalReference: this.config.siteInternalReference
				};
			}

			throw new UniFiApiError("No UniFi sites were returned by the integration API.");
		}

		return siteSummaryFromRaw(selected, this.config.siteInternalReference);
	}

	getDevices(siteId: string) {
		return this.fetchPaginated<RawRecord>(`/sites/${encodeURIComponent(siteId)}/devices`, 100, 15_000);
	}

	getDevice(siteId: string, deviceId: string) {
		return this.requestJson<RawRecord>(`/sites/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(deviceId)}`, { cacheTtlMs: 15_000 });
	}

	async getDeviceStatisticsLatest(siteId: string, deviceId: string) {
		const json = await this.requestJson<unknown>(`/sites/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(deviceId)}/statistics/latest`);
		return unwrapDataRecord(json);
	}

	getClients(siteId: string) {
		return this.fetchPaginated<RawRecord>(`/sites/${encodeURIComponent(siteId)}/clients`, 200);
	}

	getWifiBroadcasts(siteId: string) {
		return this.fetchPaginated<RawRecord>(`/sites/${encodeURIComponent(siteId)}/wifi/broadcasts`, 100, 60_000);
	}

	getNetworks(siteId: string) {
		return this.fetchPaginated<RawRecord>(`/sites/${encodeURIComponent(siteId)}/networks`, 100, 60_000);
	}

	async getLegacyEvents(siteInternalReference?: string) {
		if (!this.config.legacyEnabled || !siteInternalReference) {
			return [];
		}

		const encodedSite = encodeURIComponent(siteInternalReference);
		const json = await this.requestJson<unknown>(`/proxy/network/api/s/${encodedSite}/stat/event?limit=20`, { cacheTtlMs: 15_000 });
		return collectionFromResponse<RawRecord>(json).items;
	}
}

function siteIdFromRaw(site: RawRecord) {
	return asString(getFirst(site, ["id", "siteId", "_id"])) ?? asString(site.internalReference) ?? asString(site.name) ?? "default";
}

function siteSummaryFromRaw(site: RawRecord, internalReferenceFallback?: string): SiteSummary {
	const id = siteIdFromRaw(site);
	return {
		id,
		name: asString(getFirst(site, ["name", "description", "displayName"])) ?? id,
		internalReference: asString(getFirst(site, ["internalReference", "internal_reference", "siteName", "shortName"])) ?? internalReferenceFallback
	};
}
