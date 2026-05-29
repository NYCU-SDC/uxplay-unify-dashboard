import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDashboard } from "../lib/normalize";
import type { RawRecord } from "../lib/unifi";

function dashboardFor(device: RawRecord, stats?: RawRecord) {
	const deviceKey = String(device.id ?? device.macAddress ?? device.mac ?? "ap");

	return normalizeDashboard({
		refreshedAt: new Date("2026-05-29T00:00:00.000Z"),
		pollMs: 5000,
		controllerHostOnly: "127.0.0.1:11443",
		site: {
			id: "site",
			name: "Default"
		},
		devices: [device],
		deviceStatsById: stats ? new Map([[deviceKey, stats]]) : new Map(),
		clients: [],
		wifiBroadcasts: [],
		networks: []
	});
}

function dashboardWithClient(client: RawRecord, legacyClient?: RawRecord, refreshedAt = "2026-05-29T00:00:00.000Z") {
	return normalizeDashboard({
		refreshedAt: new Date(refreshedAt),
		pollMs: 5000,
		controllerHostOnly: "127.0.0.1:11443",
		site: {
			id: "site",
			name: "Default"
		},
		devices: [
			{
				id: "ap-1",
				name: "U6+",
				type: "access point",
				macAddress: "aa:bb:cc:dd:ee:ff"
			}
		],
		deviceStatsById: new Map(),
		clients: [client],
		legacyClients: legacyClient ? [legacyClient] : [],
		wifiBroadcasts: [],
		networks: []
	});
}

test("normalizes AP uplink throughput from latest device statistics", () => {
	const dashboard = dashboardFor(
		{
			id: "078a4061-bed4-3675-a27d-2b963c3c782e",
			name: "U6+",
			type: "access point",
			tx_rate: 999_999,
			rx_rate: 999_999
		},
		{
			uplink: {
				txRateBps: 1234,
				rxRateBps: 5678
			}
		}
	);

	assert.equal(dashboard.aps[0]?.uploadBps, 1234);
	assert.equal(dashboard.aps[0]?.downloadBps, 5678);
	assert.equal(dashboard.summary.totalUploadBps, 1234);
	assert.equal(dashboard.summary.totalDownloadBps, 5678);
});

test("missing AP uplink throughput normalizes to zero without NaN", () => {
	const dashboard = dashboardFor(
		{
			id: "078a4061-bed4-3675-a27d-2b963c3c782e",
			name: "U6+",
			type: "access point",
			tx_bytes: 999_999,
			rx_bytes: 999_999,
			tx_rate: 999_999,
			rx_rate: 999_999
		},
		{}
	);

	assert.equal(dashboard.aps[0]?.uploadBps, 0);
	assert.equal(dashboard.aps[0]?.downloadBps, 0);
	assert.equal(Number.isNaN(dashboard.aps[0]?.uploadBps), false);
	assert.equal(Number.isNaN(dashboard.aps[0]?.downloadBps), false);
	assert.equal(dashboard.summary.totalUploadBps, 0);
	assert.equal(dashboard.summary.totalDownloadBps, 0);
});

test("normalizes client throughput from legacy byte-rate fields by MAC", () => {
	const dashboard = dashboardWithClient(
		{
			id: "client-byte-rate",
			mac: "22:33:44:55:66:77",
			name: "Laptop"
		},
		{
			mac: "22:33:44:55:66:77",
			"tx_bytes-r": 125,
			"rx_bytes-r": 250,
			tx_bytes: 10_000,
			rx_bytes: 20_000,
			tx_rate: 999_999,
			rx_rate: 999_999
		}
	);

	assert.equal(dashboard.clients[0]?.uploadBps, 1000);
	assert.equal(dashboard.clients[0]?.downloadBps, 2000);
	assert.equal(dashboard.clients[0]?.txBytes, 10_000);
	assert.equal(dashboard.clients[0]?.rxBytes, 20_000);
	assert.equal(dashboard.clients[0]?.txRateBps, undefined);
	assert.equal(dashboard.clients[0]?.rxRateBps, undefined);
});

test("prefers explicit client bps fields when legacy provides them", () => {
	const dashboard = dashboardWithClient(
		{
			id: "client-explicit-rate",
			mac: "22:33:44:55:66:78",
			name: "Phone"
		},
		{
			mac: "22:33:44:55:66:78",
			txRateBps: 1234,
			rxRateBps: 5678,
			"tx_bytes-r": 125,
			"rx_bytes-r": 250
		}
	);

	assert.equal(dashboard.clients[0]?.uploadBps, 1234);
	assert.equal(dashboard.clients[0]?.downloadBps, 5678);
	assert.equal(dashboard.clients[0]?.txRateBps, 1234);
	assert.equal(dashboard.clients[0]?.rxRateBps, 5678);
});

test("derives client throughput from legacy byte counters when rates are missing", () => {
	dashboardWithClient(
		{
			id: "client-counter-rate",
			mac: "22:33:44:55:66:79",
			name: "Tablet"
		},
		{
			mac: "22:33:44:55:66:79",
			tx_bytes: 1000,
			rx_bytes: 2000
		},
		"2026-05-29T00:00:00.000Z"
	);

	const dashboard = dashboardWithClient(
		{
			id: "client-counter-rate",
			mac: "22:33:44:55:66:79",
			name: "Tablet"
		},
		{
			mac: "22:33:44:55:66:79",
			tx_bytes: 1500,
			rx_bytes: 2500
		},
		"2026-05-29T00:00:05.000Z"
	);

	assert.equal(dashboard.clients[0]?.uploadBps, 800);
	assert.equal(dashboard.clients[0]?.downloadBps, 800);
});

test("missing client throughput normalizes to zero without NaN", () => {
	const dashboard = dashboardWithClient({
		id: "client-missing-rate",
		mac: "22:33:44:55:66:80",
		name: "Desktop"
	});

	assert.equal(dashboard.clients[0]?.uploadBps, 0);
	assert.equal(dashboard.clients[0]?.downloadBps, 0);
	assert.equal(Number.isNaN(dashboard.clients[0]?.uploadBps), false);
	assert.equal(Number.isNaN(dashboard.clients[0]?.downloadBps), false);
});
