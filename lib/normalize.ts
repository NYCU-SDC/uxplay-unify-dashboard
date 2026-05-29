import type { AccessPointSummary, ClientSummary, DashboardData, DashboardEvent, DeviceIcon, HealthLabel, NetworkSummary, RadioSummary, Severity, SiteSummary, WifiBroadcastSummary } from "./types";
import type { RawRecord } from "./unifi";

interface NormalizeDashboardInput {
	refreshedAt?: Date;
	pollMs: number;
	controllerHostOnly: string;
	applicationInfo?: RawRecord;
	site: SiteSummary;
	devices: RawRecord[];
	deviceDetailsById?: Map<string, RawRecord>;
	deviceStatsById?: Map<string, RawRecord>;
	clients: RawRecord[];
	legacyClients?: RawRecord[];
	wifiBroadcasts: RawRecord[];
	networks: RawRecord[];
	legacyEvents?: RawRecord[];
	warnings?: string[];
}

interface CounterSample {
	atMs: number;
	downloadBytes?: number;
	uploadBytes?: number;
}

const previousSamples = new Map<string, CounterSample>();

export function isRecord(value: unknown): value is RawRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getFirst(obj: unknown, keys: string[]) {
	if (!isRecord(obj)) {
		return undefined;
	}

	for (const key of keys) {
		const value = obj[key];
		if (value !== undefined && value !== null && value !== "") {
			return value;
		}
	}

	return undefined;
}

export function getNestedFirst(obj: unknown, paths: string[][]) {
	for (const path of paths) {
		let current: unknown = obj;
		let found = true;

		for (const part of path) {
			if (!isRecord(current) || current[part] === undefined || current[part] === null || current[part] === "") {
				found = false;
				break;
			}

			current = current[part];
		}

		if (found) {
			return current;
		}
	}

	return undefined;
}

function firstNestedAcross(objects: unknown[], paths: string[][]) {
	for (const obj of objects) {
		const value = getNestedFirst(obj, paths);
		if (value !== undefined) {
			return value;
		}
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

function asBoolean(value: unknown) {
	if (typeof value === "boolean") {
		return value;
	}

	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (["true", "yes", "enabled", "online", "connected", "1"].includes(normalized)) {
			return true;
		}

		if (["false", "no", "disabled", "offline", "disconnected", "0"].includes(normalized)) {
			return false;
		}
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		return value > 0;
	}

	return undefined;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function percentFrom(value: unknown) {
	const number = asNumber(value);
	if (number === undefined) {
		return undefined;
	}

	return clamp(number <= 1 ? number * 100 : number, 0, 100);
}

function positiveNumber(value: unknown) {
	const number = asNumber(value);
	return number === undefined ? undefined : Math.max(0, number);
}

export function integrationDeviceId(raw: RawRecord) {
	const record = unwrapDataRecord(raw);
	return asString(getFirst(record, ["id"]));
}

export function stableDeviceKey(raw: RawRecord) {
	const record = unwrapDataRecord(raw);
	return asString(getFirst(record, ["id", "mac", "macAddress", "_id", "deviceId", "name"])) ?? "unknown";
}

export function rawEntityId(raw: RawRecord) {
	const record = unwrapDataRecord(raw);
	return asString(getFirst(record, ["id", "_id", "deviceId", "clientId", "mac", "macAddress"])) ?? "unknown";
}

function normalizeMac(mac?: string) {
	return mac?.trim().toLowerCase().replaceAll("-", ":");
}

function rawClientMac(raw: RawRecord) {
	const record = unwrapDataRecord(raw);
	return normalizeMac(asString(getFirst(record, ["mac", "macAddress", "clientMac", "client_mac"])));
}

export function maskMac(mac?: string) {
	const normalized = normalizeMac(mac);
	if (!normalized) {
		return "unknown";
	}

	const parts = normalized.split(":");
	if (parts.length !== 6) {
		return normalized;
	}

	return `${parts[0]}:${parts[1]}:••:••:${parts[4]}:${parts[5]}`;
}

function isLikelyAccessPoint(device: RawRecord) {
	const searchable = [
		getFirst(device, ["type", "deviceType", "kind", "category", "family", "productLine", "model", "modelName", "shortname", "name"]),
		getNestedFirst(device, [
			["model", "type"],
			["model", "name"],
			["product", "line"]
		])
	]
		.map(value => asString(value)?.toLowerCase())
		.filter(Boolean)
		.join(" ");

	if (searchable.includes("access point") || searchable.includes("unifi ap") || /\buap\b/.test(searchable) || /\bap\b/.test(searchable)) {
		return true;
	}

	return asBoolean(getNestedFirst(device, [["features", "wifi"], ["capabilities", "wifi"], ["wifi"], ["isWireless"]])) === true;
}

export function selectAccessPointDevices(devices: RawRecord[]) {
	const aps = devices.filter(isLikelyAccessPoint);
	if (aps.length > 0) {
		return aps;
	}

	return devices.length === 1 ? devices : [];
}

export function needsDeviceDetails(device: RawRecord) {
	const radioFields =
		getFirst(device, ["radios", "radioTable", "radio_table", "wifiRadios", "radioStatistics"]) ??
		getNestedFirst(device, [
			["statistics", "radios"],
			["wireless", "radios"]
		]);
	const uplinkFields =
		getFirst(device, ["uplink", "uplinkDevice", "uplinkDeviceId"]) ??
		getNestedFirst(device, [
			["interfaces", "uplink"],
			["network", "uplink"]
		]);
	return !Array.isArray(radioFields) || !uplinkFields;
}

export function extractApplicationVersion(info?: RawRecord) {
	if (!info) {
		return undefined;
	}

	return asString(
		getFirst(info, ["applicationVersion", "version", "networkApplicationVersion", "networkVersion"]) ??
			getNestedFirst(info, [
				["application", "version"],
				["network", "version"],
				["data", "applicationVersion"],
				["data", "version"]
			])
	);
}

function mergeDevice(listDevice: RawRecord, detail?: RawRecord) {
	const list = unwrapDataRecord(listDevice);
	if (!detail) {
		return list;
	}

	return { ...list, ...unwrapDataRecord(detail) };
}

function unwrapDataRecord(record: RawRecord) {
	return isRecord(record.data) ? { ...record, ...record.data } : record;
}

function expandSources(objects: Array<RawRecord | undefined>) {
	return objects.flatMap(obj => {
		if (!obj) {
			return [];
		}

		const unwrapped = unwrapDataRecord(obj);
		return unwrapped === obj ? [obj] : [unwrapped, obj];
	});
}

function readRate(objects: unknown[], direction: "download" | "upload") {
	const downloadPaths = [
		["statistics", "rxRateBps"],
		["statistics", "downloadBps"],
		["statistics", "downloadRateBps"],
		["traffic", "downloadBps"],
		["uplink", "rxRateBps"],
		["rxRateBps"],
		["rxRate"],
		["rx_rate"],
		["downloadBps"],
		["downloadRateBps"],
		["downlinkRateBps"],
		["rate", "download"]
	];
	const uploadPaths = [
		["statistics", "txRateBps"],
		["statistics", "uploadBps"],
		["statistics", "uploadRateBps"],
		["traffic", "uploadBps"],
		["uplink", "txRateBps"],
		["txRateBps"],
		["txRate"],
		["tx_rate"],
		["uploadBps"],
		["uploadRateBps"],
		["uplinkRateBps"],
		["rate", "upload"]
	];

	return positiveNumber(firstNestedAcross(objects, direction === "download" ? downloadPaths : uploadPaths));
}

function readApUplinkRate(stats: RawRecord | undefined, direction: "download" | "upload") {
	if (!stats) {
		return 0;
	}

	const record = unwrapDataRecord(stats);
	const field = direction === "download" ? "rxRateBps" : "txRateBps";
	return positiveNumber(getNestedFirst(record, [["uplink", field]])) ?? 0;
}

function readBytes(objects: unknown[], direction: "download" | "upload") {
	const downloadPaths = [
		["statistics", "rxBytes"],
		["statistics", "downloadBytes"],
		["traffic", "rxBytes"],
		["traffic", "downloadBytes"],
		["rxBytes"],
		["rx_bytes"],
		["bytesR"],
		["bytes-r"],
		["downloadBytes"]
	];
	const uploadPaths = [
		["statistics", "txBytes"],
		["statistics", "uploadBytes"],
		["traffic", "txBytes"],
		["traffic", "uploadBytes"],
		["txBytes"],
		["tx_bytes"],
		["bytesT"],
		["bytes-t"],
		["uploadBytes"]
	];

	return positiveNumber(firstNestedAcross(objects, direction === "download" ? downloadPaths : uploadPaths));
}

function readClientExplicitRateBps(objects: unknown[], direction: "download" | "upload") {
	const downloadPaths = [
		["statistics", "rxRateBps"],
		["traffic", "rxRateBps"],
		["rate", "rxRateBps"],
		["rate", "downloadBps"],
		["rxRateBps"],
		["rx_rate_bps"],
		["rxBps"],
		["rx_bps"],
		["downloadBps"],
		["downloadRateBps"],
		["downlinkRateBps"]
	];
	const uploadPaths = [
		["statistics", "txRateBps"],
		["traffic", "txRateBps"],
		["rate", "txRateBps"],
		["rate", "uploadBps"],
		["txRateBps"],
		["tx_rate_bps"],
		["txBps"],
		["tx_bps"],
		["uploadBps"],
		["uploadRateBps"],
		["uplinkRateBps"]
	];

	return positiveNumber(firstNestedAcross(objects, direction === "download" ? downloadPaths : uploadPaths));
}

function readClientByteRateBps(objects: unknown[], direction: "download" | "upload") {
	const downloadPaths = [
		["statistics", "rxBytesPerSecond"],
		["traffic", "rxBytesPerSecond"],
		["rxBytesPerSecond"],
		["rxBytesPerSec"],
		["rxBytesRate"],
		["rx_bytes-r"],
		["rx_bytes_r"],
		["rx_bytes_per_second"],
		["rx_bytes_per_sec"],
		["downloadBytesPerSecond"],
		["downloadBytesPerSec"],
		["downloadBytesRate"]
	];
	const uploadPaths = [
		["statistics", "txBytesPerSecond"],
		["traffic", "txBytesPerSecond"],
		["txBytesPerSecond"],
		["txBytesPerSec"],
		["txBytesRate"],
		["tx_bytes-r"],
		["tx_bytes_r"],
		["tx_bytes_per_second"],
		["tx_bytes_per_sec"],
		["uploadBytesPerSecond"],
		["uploadBytesPerSec"],
		["uploadBytesRate"]
	];
	const bytesPerSecond = positiveNumber(firstNestedAcross(objects, direction === "download" ? downloadPaths : uploadPaths));
	return bytesPerSecond === undefined ? undefined : bytesPerSecond * 8;
}

function readClientTotalBytes(objects: unknown[], direction: "download" | "upload") {
	const downloadPaths = [["statistics", "rxBytes"], ["traffic", "rxBytes"], ["traffic", "downloadBytes"], ["rxBytes"], ["rx_bytes"], ["downloadBytes"]];
	const uploadPaths = [["statistics", "txBytes"], ["traffic", "txBytes"], ["traffic", "uploadBytes"], ["txBytes"], ["tx_bytes"], ["uploadBytes"]];

	return positiveNumber(firstNestedAcross(objects, direction === "download" ? downloadPaths : uploadPaths));
}

function deriveRates(key: string, now: Date, downloadBytes?: number, uploadBytes?: number) {
	const previous = previousSamples.get(key);
	let downloadBps: number | undefined;
	let uploadBps: number | undefined;

	if (previous) {
		const deltaSeconds = (now.getTime() - previous.atMs) / 1000;
		if (deltaSeconds > 0.25) {
			if (downloadBytes !== undefined && previous.downloadBytes !== undefined) {
				downloadBps = Math.max(0, ((downloadBytes - previous.downloadBytes) * 8) / deltaSeconds);
			}

			if (uploadBytes !== undefined && previous.uploadBytes !== undefined) {
				uploadBps = Math.max(0, ((uploadBytes - previous.uploadBytes) * 8) / deltaSeconds);
			}
		}
	}

	if (downloadBytes !== undefined || uploadBytes !== undefined) {
		previousSamples.set(key, {
			atMs: now.getTime(),
			downloadBytes,
			uploadBytes
		});
	}

	return { downloadBps, uploadBps };
}

function normalizeBand(value?: string) {
	const normalized = value?.toLowerCase().replaceAll("_", " ").trim();
	if (!normalized) {
		return undefined;
	}

	if (normalized.includes("2.4") || normalized === "ng" || normalized.includes("2g")) {
		return "2.4 GHz";
	}

	if (normalized.includes("5") || normalized === "na" || normalized.includes("5g")) {
		return "5 GHz";
	}

	if (normalized.includes("6") || normalized.includes("6g")) {
		return "6 GHz";
	}

	return value;
}

function normalizeRadio(raw: unknown): RadioSummary | undefined {
	if (!isRecord(raw)) {
		return undefined;
	}

	const band = normalizeBand(
		asString(
			getFirst(raw, ["band", "radio", "radioBand", "frequencyBand", "radioName", "name"]) ??
				getNestedFirst(raw, [
					["radio", "band"],
					["statistics", "band"]
				])
		)
	);
	const channel = asString(getFirst(raw, ["channel", "channelNumber", "currentChannel"])) ?? asNumber(getFirst(raw, ["channel", "channelNumber", "currentChannel"]));
	const width =
		asNumber(getFirst(raw, ["channelWidthMHz", "channelWidth", "ht", "width"])) ??
		asNumber(
			getNestedFirst(raw, [
				["channel", "width"],
				["configuration", "channelWidth"]
			])
		);
	const utilization = percentFrom(
		getFirst(raw, ["channelUtilizationPct", "channelUtilization", "cu_total", "utilization", "busyPct"]) ??
			getNestedFirst(raw, [
				["statistics", "channelUtilization"],
				["statistics", "utilization"]
			])
	);
	const txPower = asString(getFirst(raw, ["txPower", "tx_power", "transmitPower"])) ?? asNumber(getFirst(raw, ["txPower", "tx_power", "transmitPower"]));
	const noise = asNumber(getFirst(raw, ["noiseDbm", "noise", "noiseFloor"]) ?? getNestedFirst(raw, [["statistics", "noise"]]));

	if (!band && channel === undefined && width === undefined && utilization === undefined && txPower === undefined && noise === undefined) {
		return undefined;
	}

	return {
		band,
		channel,
		channelWidthMHz: width,
		channelUtilizationPct: utilization,
		txPower,
		noiseDbm: noise
	};
}

function extractRadios(objects: unknown[]) {
	const candidates: unknown[] = [];

	for (const obj of objects) {
		if (!isRecord(obj)) {
			continue;
		}

		for (const value of [
			getFirst(obj, ["radios", "radioTable", "radio_table", "wifiRadios", "radioStatistics", "radioStats"]),
			getNestedFirst(obj, [
				["statistics", "radios"],
				["statistics", "radioTable"],
				["wireless", "radios"]
			])
		]) {
			if (Array.isArray(value)) {
				candidates.push(...value);
			}
		}
	}

	const radios = candidates.map(normalizeRadio).filter((radio): radio is RadioSummary => Boolean(radio));
	const seen = new Set<string>();
	return radios.filter(radio => {
		const key = `${radio.band ?? ""}:${radio.channel ?? ""}`;
		if (seen.has(key)) {
			return false;
		}

		seen.add(key);
		return true;
	});
}

function isOnline(raw: RawRecord) {
	const value = getFirst(raw, ["isOnline", "online", "connected", "enabled"]) ?? getFirst(raw, ["state", "status", "connectionState"]);
	const boolean = asBoolean(value);
	if (boolean !== undefined) {
		return boolean;
	}

	const text = asString(value)?.toLowerCase();
	if (!text) {
		return true;
	}

	return !["offline", "disconnected", "down", "failed", "disabled"].includes(text);
}

function normalizeAccessPoint(rawDevice: RawRecord, stats: RawRecord | undefined, now: Date, clients: ClientSummary[]): AccessPointSummary {
	const sources = expandSources([stats, rawDevice]);
	const id = stableDeviceKey(rawDevice);
	const model = asString(
		getFirst(rawDevice, ["model", "modelName", "shortname", "displayModel", "productName"]) ??
			getNestedFirst(rawDevice, [
				["model", "name"],
				["product", "name"]
			])
	);
	const name = asString(getFirst(rawDevice, ["name", "displayName", "hostname", "deviceName"])) ?? model ?? id;
	const downloadBps = readApUplinkRate(stats, "download");
	const uploadBps = readApUplinkRate(stats, "upload");
	const clientCount = clients.filter(client => client.apId === id).length;

	return {
		id,
		name,
		model,
		state: asString(getFirst(rawDevice, ["state", "connectionState"])),
		status: asString(getFirst(rawDevice, ["status", "displayStatus"])) ?? (isOnline(rawDevice) ? "Online" : "Offline"),
		ip: asString(
			getFirst(rawDevice, ["ip", "ipAddress", "displayIp", "lanIp"]) ??
				getNestedFirst(rawDevice, [
					["network", "ip"],
					["interfaces", "primary", "ip"]
				])
		),
		mac: normalizeMac(asString(getFirst(rawDevice, ["mac", "macAddress"]))),
		firmware: asString(
			getFirst(rawDevice, ["firmware", "firmwareVersion", "version"]) ??
				getNestedFirst(rawDevice, [
					["firmware", "version"],
					["system", "firmwareVersion"]
				])
		),
		uptimeSec: positiveNumber(getFirst(stats, ["uptimeSec", "uptime", "systemUptime"]) ?? getFirst(rawDevice, ["uptimeSec", "uptime", "systemUptime"])),
		cpuPct: percentFrom(
			getFirst(stats, ["cpuPct", "cpuUtilization", "cpu", "cpuUsage"]) ??
				getNestedFirst(stats, [
					["system", "cpu"],
					["statistics", "cpuUtilization"]
				])
		),
		memoryPct: percentFrom(
			getFirst(stats, ["memoryPct", "memoryUtilization", "mem", "memoryUsage"]) ??
				getNestedFirst(stats, [
					["system", "memory"],
					["statistics", "memoryUtilization"]
				])
		),
		downloadBps,
		uploadBps,
		activityBps: (downloadBps ?? 0) + (uploadBps ?? 0),
		clientCount: clientCount || positiveNumber(getFirst(stats, ["clientCount", "numClients", "users"]) ?? getFirst(rawDevice, ["clientCount", "numClients", "users"])),
		radios: extractRadios(sources)
	};
}

function normalizeWifiGeneration(value: string | undefined, band?: string) {
	if (!value) {
		return undefined;
	}

	const normalized = value.toLowerCase().replaceAll("_", " ");
	if (normalized.includes("wifi 7") || normalized.includes("wi-fi 7") || normalized.includes("802.11be") || /\bbe\b/.test(normalized)) {
		return "WiFi 7";
	}

	if (normalized.includes("wifi 6e") || normalized.includes("wi-fi 6e")) {
		return "WiFi 6E";
	}

	if (normalized.includes("wifi 6") || normalized.includes("wi-fi 6") || normalized.includes("802.11ax") || /\bax\b/.test(normalized)) {
		return band === "6 GHz" ? "WiFi 6E" : "WiFi 6";
	}

	if (normalized.includes("wifi 5") || normalized.includes("wi-fi 5") || normalized.includes("802.11ac") || /\bac\b/.test(normalized)) {
		return "WiFi 5";
	}

	if (normalized.includes("wifi 4") || normalized.includes("wi-fi 4") || normalized.includes("802.11n") || /\bn\b/.test(normalized)) {
		return "WiFi 4";
	}

	return value;
}

function experienceLabel(score?: number): HealthLabel {
	if (score === undefined) {
		return "Unknown";
	}

	if (score >= 90) {
		return "Excellent";
	}

	if (score >= 75) {
		return "Good";
	}

	if (score >= 55) {
		return "Fair";
	}

	return "Poor";
}

function labelFromRssi(rssi?: number): HealthLabel {
	if (rssi === undefined) {
		return "Unknown";
	}

	if (rssi >= -60) {
		return "Excellent";
	}

	if (rssi >= -70) {
		return "Good";
	}

	if (rssi >= -75) {
		return "Fair";
	}

	return "Poor";
}

function signalPctFromRssi(rssi?: number) {
	if (rssi === undefined) {
		return undefined;
	}

	return clamp((rssi + 100) * 2, 0, 100);
}

function normalizeTime(value: unknown) {
	if (value === undefined || value === null || value === "") {
		return undefined;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		const ms = value > 10_000_000_000 ? value : value * 1000;
		return new Date(ms).toISOString();
	}

	const text = asString(value);
	if (!text) {
		return undefined;
	}

	const parsed = Date.parse(text);
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : text;
}

function normalizeDeviceIcon(raw: RawRecord): DeviceIcon {
	const text = [
		getFirst(raw, ["name", "displayName", "hostname", "clientName", "manufacturer", "vendor", "osName", "deviceType"]),
		getNestedFirst(raw, [
			["device", "type"],
			["os", "name"]
		])
	]
		.map(value => asString(value)?.toLowerCase())
		.filter(Boolean)
		.join(" ");

	if (text.includes("iphone") || text.includes("android") || text.includes("phone") || text.includes("pixel")) {
		return "phone";
	}

	if (text.includes("ipad") || text.includes("tablet")) {
		return "tablet";
	}

	if (text.includes("desktop") || text.includes("pc") || text.includes("imac") || text.includes("workstation")) {
		return "desktop";
	}

	if (text.includes("raspberry") || text.includes("raspi")) {
		return "raspberry-pi";
	}

	if (text.includes("laptop") || text.includes("macbook") || text.includes("notebook")) {
		return "laptop";
	}

	return "unknown";
}

function normalizeClient(raw: RawRecord, legacyRaw: RawRecord | undefined, now: Date, apById: Map<string, AccessPointSummary>, apIdByMac: Map<string, string>): ClientSummary {
	const integrationRaw = unwrapDataRecord(raw);
	const legacy = legacyRaw ? unwrapDataRecord(legacyRaw) : undefined;
	const merged = legacy ? { ...legacy, ...integrationRaw } : integrationRaw;
	const sources = expandSources([legacy, integrationRaw]);
	const id = rawEntityId(merged);
	const mac = rawClientMac(merged);
	const hostname = asString(getFirst(merged, ["hostname", "hostName", "clientName"]));
	const displayName = asString(getFirst(merged, ["name", "displayName", "alias", "clientName", "hostname", "hostName"])) ?? maskMac(mac);
	const rawApId =
		asString(
			getFirst(merged, ["apId", "accessPointId", "uplinkDeviceId", "deviceId", "connectedDeviceId", "uplinkApId", "apMac", "ap_mac", "lastUplinkMac", "last_uplink_mac"]) ??
				getNestedFirst(merged, [
					["accessPoint", "id"],
					["ap", "id"],
					["uplink", "deviceId"],
					["uplink", "apId"],
					["association", "deviceId"],
					["lastUplink", "uap_id"]
				])
		) ?? undefined;
	const apId = rawApId && apById.has(rawApId) ? rawApId : rawApId ? (apIdByMac.get(normalizeMac(rawApId) ?? "") ?? rawApId) : undefined;
	const band = normalizeBand(
		asString(
			getFirst(merged, ["band", "radioBand", "frequencyBand", "radio", "radioName", "radio_name", "last_radio"]) ??
				getNestedFirst(merged, [
					["wifi", "band"],
					["radio", "band"],
					["connection", "band"]
				])
		)
	);
	const technology = asString(
		getFirst(merged, ["technology", "phyMode", "wifiStandard", "radio_proto", "protocol"]) ??
			getNestedFirst(merged, [
				["connection", "technology"],
				["wifi", "standard"]
			])
	);
	const wifiGeneration = normalizeWifiGeneration(asString(getFirst(merged, ["wifiGeneration", "wifiGen", "generation"])) ?? undefined, band) ?? normalizeWifiGeneration(technology, band);
	const rssi = asNumber(
		getFirst(merged, ["rssiDbm", "rssi", "signalDbm", "signal"]) ??
			getNestedFirst(merged, [
				["signal", "rssi"],
				["wifi", "rssi"]
			])
	);
	const explicitSignalPct = percentFrom(getFirst(merged, ["signalPct", "signalPercent", "signalStrengthPct"]) ?? getNestedFirst(merged, [["signal", "percent"]]));
	const experienceScore = percentFrom(
		getFirst(merged, ["experienceScore", "wifiExperience", "experience", "satisfaction", "satisfaction_now", "satisfaction_avg", "satisfaction_real", "score"]) ??
			getNestedFirst(merged, [
				["experience", "score"],
				["wifi", "experienceScore"]
			])
	);
	const downloadBytes = readClientTotalBytes(sources, "download");
	const uploadBytes = readClientTotalBytes(sources, "upload");
	const derived = deriveRates(`client:${mac ?? id}`, now, downloadBytes, uploadBytes);
	const txRateBps = readClientExplicitRateBps(sources, "upload");
	const rxRateBps = readClientExplicitRateBps(sources, "download");
	const downloadBps = rxRateBps ?? readClientByteRateBps(sources, "download") ?? derived.downloadBps ?? 0;
	const uploadBps = txRateBps ?? readClientByteRateBps(sources, "upload") ?? derived.uploadBps ?? 0;
	const total24h = positiveNumber(
		getFirst(merged, ["usage24hBytes", "dailyUsageBytes", "last24hBytes"]) ??
			getNestedFirst(merged, [
				["usage", "last24hBytes"],
				["traffic", "usage24hBytes"]
			])
	);

	return {
		id,
		name: displayName,
		hostname,
		ip: asString(
			getFirst(merged, ["ip", "ipAddress", "displayIp", "last_ip"]) ??
				getNestedFirst(merged, [
					["network", "ip"],
					["connection", "ip"]
				])
		),
		macMasked: maskMac(mac),
		apId,
		apName: apId ? apById.get(apId)?.name : undefined,
		ssid: asString(
			getFirst(merged, ["ssid", "essid", "wifiName", "wlanName"]) ??
				getNestedFirst(merged, [
					["wifi", "name"],
					["wlan", "name"],
					["network", "ssid"]
				])
		),
		network: asString(
			getFirst(merged, ["network", "networkName", "vlanName"]) ??
				getNestedFirst(merged, [
					["network", "name"],
					["vlan", "name"]
				])
		),
		experienceLabel: experienceScore !== undefined ? experienceLabel(experienceScore) : labelFromRssi(rssi),
		experienceScore,
		wifiGeneration,
		technology,
		band,
		channel: asString(
			getFirst(merged, ["channel", "channelNumber"]) ??
				getNestedFirst(merged, [
					["wifi", "channel"],
					["connection", "channel"]
				])
		),
		channelWidthMHz: asNumber(
			getFirst(merged, ["channelWidthMHz", "channelWidth", "channel_width", "width"]) ??
				getNestedFirst(merged, [
					["wifi", "channelWidth"],
					["connection", "channelWidth"]
				])
		),
		mimo: asString(getFirst(merged, ["mimo", "spatialStreams", "spatialStream", "nss"]) ?? getNestedFirst(merged, [["wifi", "mimo"]])),
		rssiDbm: rssi,
		signalPct: explicitSignalPct ?? signalPctFromRssi(rssi),
		downloadBps,
		uploadBps,
		activityBps: downloadBps + uploadBps,
		txRateBps,
		rxRateBps,
		txBytes: uploadBytes,
		rxBytes: downloadBytes,
		usage24hBytes: total24h,
		connectedSeconds: positiveNumber(getFirst(merged, ["connectedSeconds", "uptime", "uptimeSec", "associationTime"]) ?? getNestedFirst(merged, [["connection", "uptime"]])),
		lastSeen: normalizeTime(getFirst(merged, ["lastSeen", "lastSeenAt", "last_seen", "seenAt"]) ?? getNestedFirst(merged, [["lastSeen", "time"]])),
		isOnline: isOnline(merged),
		deviceIcon: normalizeDeviceIcon(merged)
	};
}

function normalizeWifiBroadcast(raw: RawRecord): WifiBroadcastSummary {
	raw = unwrapDataRecord(raw);
	const id = rawEntityId(raw);
	return {
		id,
		name: asString(getFirst(raw, ["name", "ssid", "wlanName"])) ?? id,
		enabled: asBoolean(getFirst(raw, ["enabled", "isEnabled", "active"]))
	};
}

function normalizeNetwork(raw: RawRecord): NetworkSummary {
	raw = unwrapDataRecord(raw);
	const id = rawEntityId(raw);
	return {
		id,
		name: asString(getFirst(raw, ["name", "displayName", "networkName"])) ?? id,
		purpose: asString(getFirst(raw, ["purpose", "type", "networkPurpose"])),
		vlanId: asNumber(getFirst(raw, ["vlanId", "vlan", "vid"]) ?? getNestedFirst(raw, [["vlan", "id"]]))
	};
}

function severityFrom(value: unknown): Severity {
	const text = asString(value)?.toLowerCase();
	if (!text) {
		return "info";
	}

	if (["error", "critical", "alert"].some(level => text.includes(level))) {
		return "error";
	}

	if (["warn", "warning"].some(level => text.includes(level))) {
		return "warning";
	}

	return "info";
}

function normalizeEvent(raw: RawRecord, index: number): DashboardEvent | undefined {
	const message = asString(getFirst(raw, ["message", "msg", "description", "text", "event"]) ?? getNestedFirst(raw, [["data", "message"]]));
	if (!message) {
		return undefined;
	}

	const time = normalizeTime(getFirst(raw, ["time", "datetime", "timestamp", "date"]) ?? getNestedFirst(raw, [["meta", "time"]])) ?? new Date().toISOString();

	return {
		id: asString(getFirst(raw, ["id", "_id", "eventId"])) ?? `${time}-${index}`,
		time,
		message,
		severity: severityFrom(getFirst(raw, ["severity", "level", "type", "subsystem"]))
	};
}

function healthFrom(aps: AccessPointSummary[], clients: ClientSummary[]) {
	const hasData = aps.length > 0 || clients.length > 0;
	if (!hasData) {
		return { healthLabel: "Unknown" as HealthLabel, healthScore: 0 };
	}

	let score = 100;

	for (const ap of aps) {
		const online = !["offline", "disconnected", "down", "failed"].includes((ap.status ?? ap.state ?? "").toLowerCase());
		if (!online) {
			score -= 40;
		}

		if (ap.cpuPct !== undefined && ap.cpuPct > 80) {
			score -= 10;
		}

		if (ap.memoryPct !== undefined && ap.memoryPct > 85) {
			score -= 10;
		}

		for (const radio of ap.radios ?? []) {
			if (radio.channelUtilizationPct !== undefined && radio.channelUtilizationPct > 70) {
				score -= 15;
			}
		}
	}

	const poorRssiPenalty = Math.min(
		30,
		clients.reduce((penalty, client) => penalty + (client.rssiDbm !== undefined && client.rssiDbm < -75 ? 10 : 0), 0)
	);
	const poorExperiencePenalty = Math.min(
		30,
		clients.reduce((penalty, client) => penalty + (client.experienceScore !== undefined && client.experienceScore < 70 ? 10 : 0), 0)
	);

	score = clamp(score - poorRssiPenalty - poorExperiencePenalty, 0, 100);

	let healthLabel: HealthLabel = "Poor";
	if (score >= 90) {
		healthLabel = "Excellent";
	} else if (score >= 75) {
		healthLabel = "Good";
	} else if (score >= 55) {
		healthLabel = "Fair";
	}

	return { healthLabel, healthScore: Math.round(score) };
}

export function normalizeDashboard(input: NormalizeDashboardInput): DashboardData {
	const now = input.refreshedAt ?? new Date();
	const apRawDevices = selectAccessPointDevices(input.devices);
	const apById = new Map<string, AccessPointSummary>();
	const apIdByMac = new Map<string, string>();

	for (const raw of apRawDevices) {
		const rawKey = stableDeviceKey(raw);
		const merged = mergeDevice(raw, input.deviceDetailsById?.get(rawKey));
		const id = stableDeviceKey(merged);
		const mac = normalizeMac(asString(getFirst(merged, ["mac", "macAddress"])));
		const provisional = normalizeAccessPoint(merged, input.deviceStatsById?.get(rawKey) ?? input.deviceStatsById?.get(id), now, []);
		apById.set(id, provisional);
		apById.set(rawKey, provisional);
		if (mac) {
			apIdByMac.set(mac, id);
		}
	}

	const legacyClientsByMac = new Map<string, RawRecord>();
	for (const legacyClient of input.legacyClients ?? []) {
		const mac = rawClientMac(legacyClient);
		if (mac) {
			legacyClientsByMac.set(mac, legacyClient);
		}
	}

	const clients = input.clients.map(client => normalizeClient(client, legacyClientsByMac.get(rawClientMac(client) ?? ""), now, apById, apIdByMac)).sort((a, b) => b.activityBps - a.activityBps);
	const aps = apRawDevices.map(raw => {
		const rawKey = stableDeviceKey(raw);
		const merged = mergeDevice(raw, input.deviceDetailsById?.get(rawKey));
		const id = stableDeviceKey(merged);
		const normalized = normalizeAccessPoint(merged, input.deviceStatsById?.get(rawKey) ?? input.deviceStatsById?.get(id), now, clients);
		apById.set(id, normalized);
		apById.set(rawKey, normalized);
		return normalized;
	});

	const onlineClients = clients.filter(client => client.isOnline).length;
	const accessPointsOnline = aps.filter(ap => !["offline", "disconnected", "down", "failed"].includes((ap.status ?? ap.state ?? "").toLowerCase())).length;
	const clientDownloadBps = clients.reduce((sum, client) => sum + client.downloadBps, 0);
	const clientUploadBps = clients.reduce((sum, client) => sum + client.uploadBps, 0);
	const apDownloadBps = aps.reduce((sum, ap) => sum + (ap.downloadBps ?? 0), 0);
	const apUploadBps = aps.reduce((sum, ap) => sum + (ap.uploadBps ?? 0), 0);
	const totalDownloadBps = aps.length > 0 ? apDownloadBps : clientDownloadBps;
	const totalUploadBps = aps.length > 0 ? apUploadBps : clientUploadBps;
	const usageValues = clients.map(client => client.usage24hBytes).filter((value): value is number => value !== undefined);
	const health = healthFrom(aps, clients);
	const events = (input.legacyEvents ?? [])
		.map(normalizeEvent)
		.filter((event): event is DashboardEvent => Boolean(event))
		.slice(0, 12);

	return {
		refreshedAt: now.toISOString(),
		pollMs: input.pollMs,
		site: input.site,
		controller: {
			baseUrlHostOnly: input.controllerHostOnly,
			applicationVersion: extractApplicationVersion(input.applicationInfo)
		},
		summary: {
			onlineClients,
			accessPointsOnline,
			accessPointsTotal: aps.length,
			totalDownloadBps,
			totalUploadBps,
			totalActivityBps: totalDownloadBps + totalUploadBps,
			totalUsage24hBytes: usageValues.length > 0 ? usageValues.reduce((sum, value) => sum + value, 0) : undefined,
			healthLabel: health.healthLabel,
			healthScore: health.healthScore
		},
		aps,
		clients,
		wifiBroadcasts: input.wifiBroadcasts.map(normalizeWifiBroadcast),
		networks: input.networks.map(normalizeNetwork),
		events,
		warnings: input.warnings ?? []
	};
}
