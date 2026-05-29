import "dotenv/config";

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractApplicationVersion, getFirst, integrationDeviceId, isRecord, needsDeviceDetails, normalizeDashboard, selectAccessPointDevices, stableDeviceKey } from "../lib/normalize";
import { toSafeErrorMessage, UniFiClient, type RawRecord } from "../lib/unifi";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const isProduction = process.env.NODE_ENV === "production";
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);
const FOX_WALLPAPER_URL = "https://randomfox.ca/floof/";
const debugUniFiRaw = process.env.DEBUG_UNIFI_RAW === "1" || process.env.DEBUG_UNIFI_RAW?.toLowerCase() === "true";

interface FoxWallpaper {
	image: string;
	link: string;
	refreshedAt: string;
}

let lastWallpaper: FoxWallpaper | undefined;

function fulfilledValue<T>(result: PromiseSettledResult<T>) {
	return result.status === "fulfilled" ? result.value : undefined;
}

function rejectedWarning(label: string, result: PromiseSettledResult<unknown>) {
	return result.status === "rejected" ? `${label}: ${toSafeErrorMessage(result.reason)}` : undefined;
}

async function settledMap<T>(items: RawRecord[], keyer: (item: RawRecord) => string, loader: (item: RawRecord) => Promise<T>) {
	const results = await Promise.allSettled(
		items.map(async item => {
			const id = keyer(item);
			return [id, await loader(item)] as const;
		})
	);
	const map = new Map<string, T>();
	const warnings: string[] = [];

	for (const result of results) {
		if (result.status === "fulfilled") {
			map.set(result.value[0], result.value[1]);
		} else {
			warnings.push(toSafeErrorMessage(result.reason));
		}
	}

	return { map, warnings };
}

function debugApOverview(device: RawRecord | undefined) {
	if (!device) {
		return undefined;
	}

	return {
		id: integrationDeviceId(device),
		name: getFirst(device, ["name", "displayName", "hostname", "deviceName"]),
		macAddress: getFirst(device, ["macAddress", "mac"])
	};
}

function debugStatsUplink(stats: RawRecord | undefined) {
	const uplink = stats?.uplink;
	return isRecord(uplink) ? uplink : undefined;
}

const app = express();
app.disable("x-powered-by");

app.use((_request, response, next) => {
	response.setHeader("Cache-Control", "no-store");
	next();
});

app.get("/api/unifi/health", async (_request, response) => {
	try {
		const client = new UniFiClient();
		const [infoResult, siteResult] = await Promise.allSettled([client.getApplicationInfo(), client.getSelectedSite()]);
		const selectedSite = fulfilledValue(siteResult);
		const applicationVersion = extractApplicationVersion(fulfilledValue(infoResult));

		if (infoResult.status === "fulfilled" && selectedSite) {
			response.json({
				ok: true,
				applicationVersion,
				selectedSite
			});
			return;
		}

		const error = [rejectedWarning("Application info unavailable", infoResult), rejectedWarning("Site selection failed", siteResult)].filter(Boolean).join(" ");
		response.status(503).json({
			ok: false,
			applicationVersion,
			selectedSite,
			error: error || "UniFi health check failed."
		});
	} catch (error) {
		response.status(503).json({
			ok: false,
			error: toSafeErrorMessage(error)
		});
	}
});

app.get("/api/unifi/dashboard", async (_request, response) => {
	const refreshedAt = new Date();

	try {
		const client = new UniFiClient();
		const [infoResult, siteResult] = await Promise.allSettled([client.getApplicationInfo(), client.getSelectedSite()]);
		const site = fulfilledValue(siteResult);
		const warnings = [rejectedWarning("Application info unavailable", infoResult)].filter((warning): warning is string => Boolean(warning));

		if (!site) {
			response.status(503).json({
				error: rejectedWarning("Site selection failed", siteResult) ?? "Unable to select a UniFi site."
			});
			return;
		}

		const [devicesResult, clientsResult, wifiBroadcastsResult, networksResult, legacyEventsResult] = await Promise.allSettled([
			client.getDevices(site.id),
			client.getClients(site.id),
			client.getWifiBroadcasts(site.id),
			client.getNetworks(site.id),
			client.getLegacyEvents(site.internalReference)
		]);

		for (const warning of [
			rejectedWarning("Devices unavailable", devicesResult),
			rejectedWarning("Clients unavailable", clientsResult),
			rejectedWarning("WiFi broadcasts unavailable", wifiBroadcastsResult),
			rejectedWarning("Networks unavailable", networksResult),
			rejectedWarning("Legacy enrichment unavailable", legacyEventsResult)
		]) {
			if (warning) {
				warnings.push(warning);
			}
		}

		const devices = fulfilledValue(devicesResult) ?? [];
		const clients = fulfilledValue(clientsResult) ?? [];
		const wifiBroadcasts = fulfilledValue(wifiBroadcastsResult) ?? [];
		const networks = fulfilledValue(networksResult) ?? [];
		const legacyEvents = fulfilledValue(legacyEventsResult) ?? [];
		const apTargets = selectAccessPointDevices(devices);
		const visibleApTargets = apTargets.length > 0 ? apTargets : devices.slice(0, 3);
		const detailTargets = visibleApTargets.filter(device => integrationDeviceId(device) && needsDeviceDetails(device));
		const statsTargets = visibleApTargets.filter(device => integrationDeviceId(device));
		const [detailsResult, statsResult] = await Promise.allSettled([
			settledMap(detailTargets, stableDeviceKey, device => client.getDevice(site.id, integrationDeviceId(device)!)),
			settledMap(statsTargets, stableDeviceKey, device => client.getDeviceStatisticsLatest(site.id, integrationDeviceId(device)!))
		]);

		const deviceDetailsById = fulfilledValue(detailsResult)?.map ?? new Map<string, RawRecord>();
		const deviceStatsById = fulfilledValue(statsResult)?.map ?? new Map<string, RawRecord>();

		if (detailsResult.status === "fulfilled") {
			warnings.push(...detailsResult.value.warnings.map(warning => `Device detail unavailable: ${warning}`));
		} else {
			warnings.push(`Device details unavailable: ${toSafeErrorMessage(detailsResult.reason)}`);
		}

		if (statsResult.status === "fulfilled") {
			warnings.push(...statsResult.value.warnings.map(warning => `Latest device statistics unavailable: ${warning}`));
		} else {
			warnings.push(`Latest device statistics unavailable: ${toSafeErrorMessage(statsResult.reason)}`);
		}

		const dashboard = normalizeDashboard({
			refreshedAt,
			pollMs: client.config.pollMs,
			controllerHostOnly: client.controllerHostOnly,
			applicationInfo: fulfilledValue(infoResult),
			site,
			devices,
			deviceDetailsById,
			deviceStatsById,
			clients,
			wifiBroadcasts,
			networks,
			legacyEvents,
			warnings
		});

		if (!isProduction || debugUniFiRaw) {
			const firstAp = visibleApTargets[0];
			const firstApKey = firstAp ? stableDeviceKey(firstAp) : undefined;
			const firstApStats = firstApKey ? deviceStatsById.get(firstApKey) : undefined;
			response.json({
				...dashboard,
				_debug: {
					firstAp: debugApOverview(firstAp),
					statisticsTopLevelKeys: firstApStats ? Object.keys(firstApStats).sort() : [],
					statisticsUplink: debugStatsUplink(firstApStats),
					normalizedThroughput: {
						uploadBps: dashboard.aps[0]?.uploadBps ?? 0,
						downloadBps: dashboard.aps[0]?.downloadBps ?? 0
					}
				}
			});
			return;
		}

		response.json(dashboard);
	} catch (error) {
		response.status(503).json({
			error: toSafeErrorMessage(error)
		});
	}
});

app.get("/api/wallpaper", async (_request, response) => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 8000);

	try {
		const wallpaperResponse = await fetch(FOX_WALLPAPER_URL, {
			headers: {
				Accept: "application/json"
			},
			cache: "no-store",
			signal: controller.signal
		});

		if (!wallpaperResponse.ok) {
			throw new Error(`randomfox returned ${wallpaperResponse.status}.`);
		}

		const payload = (await wallpaperResponse.json()) as Partial<FoxWallpaper>;
		if (!payload.image || !payload.link || !payload.image.startsWith("https://randomfox.ca/")) {
			throw new Error("randomfox returned an invalid wallpaper payload.");
		}

		lastWallpaper = {
			image: payload.image,
			link: payload.link,
			refreshedAt: new Date().toISOString()
		};
		response.json(lastWallpaper);
	} catch (error) {
		if (lastWallpaper) {
			response.json({
				...lastWallpaper,
				warning: toSafeErrorMessage(error)
			});
			return;
		}

		response.status(503).json({
			error: toSafeErrorMessage(error)
		});
	} finally {
		clearTimeout(timeout);
	}
});

if (isProduction) {
	const indexHtmlPath = path.join(distDir, "index.html");
	app.use(express.static(distDir, { index: false }));
	app.use((_request, response) => {
		response.type("html").send(fs.readFileSync(indexHtmlPath, "utf8"));
	});
} else {
	const { createServer } = await import("vite");
	const vite = await createServer({
		root: rootDir,
		appType: "spa",
		server: {
			middlewareMode: true
		}
	});

	app.use(vite.middlewares);
}

app.listen(port, host, () => {
	const mode = isProduction ? "production" : "development";
	const staticStatus = isProduction ? (fs.existsSync(distDir) ? "serving dist" : "dist missing") : "vite middleware";
	console.log(`UniFi dashboard ${mode} server listening on http://${host}:${port} (${staticStatus})`);
});
