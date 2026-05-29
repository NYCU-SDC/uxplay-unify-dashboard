import { extractApplicationVersion } from "@/lib/normalize";
import type { HealthResponse } from "@/lib/types";
import { toSafeErrorMessage, UniFiClient } from "@/lib/unifi";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(body: HealthResponse, status = 200) {
	return NextResponse.json(body, {
		status,
		headers: {
			"Cache-Control": "no-store"
		}
	});
}

export async function GET() {
	try {
		const client = new UniFiClient();
		const [infoResult, siteResult] = await Promise.allSettled([client.getApplicationInfo(), client.getSelectedSite()]);
		const applicationVersion = infoResult.status === "fulfilled" ? extractApplicationVersion(infoResult.value) : undefined;
		const selectedSite = siteResult.status === "fulfilled" ? siteResult.value : undefined;

		if (infoResult.status === "fulfilled" && siteResult.status === "fulfilled") {
			return json({
				ok: true,
				applicationVersion,
				selectedSite
			});
		}

		const error = [infoResult.status === "rejected" ? toSafeErrorMessage(infoResult.reason) : undefined, siteResult.status === "rejected" ? toSafeErrorMessage(siteResult.reason) : undefined]
			.filter(Boolean)
			.join(" ");

		return json(
			{
				ok: false,
				applicationVersion,
				selectedSite,
				error: error || "UniFi health check failed."
			},
			503
		);
	} catch (error) {
		return json(
			{
				ok: false,
				error: toSafeErrorMessage(error)
			},
			503
		);
	}
}
