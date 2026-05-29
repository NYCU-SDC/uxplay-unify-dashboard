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
