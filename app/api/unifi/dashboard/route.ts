import { needsDeviceDetails, normalizeDashboard, rawEntityId, selectAccessPointDevices } from "@/lib/normalize";
import { toSafeErrorMessage, UniFiClient, type RawRecord } from "@/lib/unifi";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(body: unknown, status = 200) {
	return NextResponse.json(body, {
		status,
		headers: {
			"Cache-Control": "no-store"
		}
	});
}

function fulfilledValue<T>(result: PromiseSettledResult<T>) {
	return result.status === "fulfilled" ? result.value : undefined;
}

function rejectedWarning(label: string, result: PromiseSettledResult<unknown>) {
	return result.status === "rejected" ? `${label}: ${toSafeErrorMessage(result.reason)}` : undefined;
}

async function settledMap<T>(items: RawRecord[], loader: (item: RawRecord) => Promise<T>) {
	const results = await Promise.allSettled(
		items.map(async item => {
			const id = rawEntityId(item);
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

export async function GET() {
	const refreshedAt = new Date();

	try {
		const client = new UniFiClient();
		const [infoResult, siteResult] = await Promise.allSettled([client.getApplicationInfo(), client.getSelectedSite()]);
		const site = fulfilledValue(siteResult);
		const warnings = [rejectedWarning("Application info unavailable", infoResult)].filter((warning): warning is string => Boolean(warning));

		if (!site) {
			return json(
				{
					error: rejectedWarning("Site selection failed", siteResult) ?? "Unable to select a UniFi site."
				},
				503
			);
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
		const detailTargets = visibleApTargets.filter(device => rawEntityId(device) !== "unknown" && needsDeviceDetails(device));
		const statsTargets = visibleApTargets.filter(device => rawEntityId(device) !== "unknown");
		const [detailsResult, statsResult] = await Promise.allSettled([
			settledMap(detailTargets, device => client.getDevice(site.id, rawEntityId(device))),
			settledMap(statsTargets, device => client.getDeviceStatisticsLatest(site.id, rawEntityId(device)))
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

		return json(dashboard);
	} catch (error) {
		return json(
			{
				error: toSafeErrorMessage(error)
			},
			503
		);
	}
}
