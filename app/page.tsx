"use client";

import { ClientTable } from "@/components/ClientTable";
import { type DashboardView, SegmentedViewToggle } from "@/components/SegmentedViewToggle";
import { StatsPanel } from "@/components/StatsPanel";
import { TopologyView } from "@/components/TopologyView";
import type { DashboardData } from "@/lib/types";
import { AlertTriangle, Clock, RefreshCw, Server, ShieldCheck, Wifi } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const FALLBACK_POLL_MS = 5000;

function healthClass(label: string | undefined) {
	if (label === "Excellent") {
		return "border-emerald-100 bg-emerald-50 text-emerald-700";
	}

	if (label === "Good") {
		return "border-lime-100 bg-lime-50 text-lime-700";
	}

	if (label === "Fair") {
		return "border-amber-100 bg-amber-50 text-amber-700";
	}

	if (label === "Poor") {
		return "border-rose-100 bg-rose-50 text-rose-700";
	}

	return "border-slate-200 bg-slate-50 text-slate-600";
}

function ageLabel(refreshedAt: string | undefined, now: number) {
	if (!refreshedAt) {
		return "waiting";
	}

	const age = Math.max(0, Math.round((now - Date.parse(refreshedAt)) / 1000));
	if (age < 60) {
		return `${age}s ago`;
	}

	const minutes = Math.floor(age / 60);
	const seconds = age % 60;
	return `${minutes}m ${seconds}s ago`;
}

async function readDashboard(signal?: AbortSignal) {
	const response = await fetch("/api/unifi/dashboard", {
		cache: "no-store",
		signal
	});
	const payload = (await response.json().catch(() => null)) as DashboardData | { error?: string } | null;

	if (!response.ok) {
		throw new Error(payload && "error" in payload && payload.error ? payload.error : `Dashboard request failed with ${response.status}.`);
	}

	return payload as DashboardData;
}

export default function DashboardPage() {
	const [view, setView] = useState<DashboardView>("topology");
	const [data, setData] = useState<DashboardData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [now, setNow] = useState(() => Date.now());
	const pollMsRef = useRef(FALLBACK_POLL_MS);

	useEffect(() => {
		let cancelled = false;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		let controller: AbortController | undefined;

		const run = async () => {
			controller = new AbortController();
			try {
				const nextData = await readDashboard(controller.signal);
				if (cancelled) {
					return;
				}

				pollMsRef.current = nextData.pollMs || FALLBACK_POLL_MS;
				setData(nextData);
				setError(null);
			} catch (requestError) {
				if (!cancelled) {
					setError(requestError instanceof Error ? requestError.message : "Dashboard request failed.");
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
					timeout = setTimeout(run, pollMsRef.current);
				}
			}
		};

		run();

		return () => {
			cancelled = true;
			controller?.abort();
			if (timeout) {
				clearTimeout(timeout);
			}
		};
	}, []);

	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(interval);
	}, []);

	const lastRefresh = useMemo(() => ageLabel(data?.refreshedAt, now), [data?.refreshedAt, now]);
	const panelTitle = data ? `${data.site.name} · ${data.controller.baseUrlHostOnly}` : "UniFi Office";

	return (
		<main className="min-h-screen bg-[#f5f7fa] text-slate-950">
			<header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur xl:px-6">
				<div className="flex min-w-0 items-center gap-3">
					<div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-blue-100 bg-blue-50">
						<Wifi className="h-5 w-5 text-blue-600" strokeWidth={1.8} aria-hidden="true" />
					</div>
					<div className="min-w-0">
						<h1 className="truncate text-base font-semibold text-slate-950">UniFi Office</h1>
						<div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
							<span className="inline-flex min-w-0 items-center gap-1">
								<Server className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
								<span className="truncate">{panelTitle}</span>
							</span>
							{data?.controller.applicationVersion ? <span>Network {data.controller.applicationVersion}</span> : null}
						</div>
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-end gap-2">
					{data ? (
						<span className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${healthClass(data.summary.healthLabel)}`}>
							<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
							{data.summary.healthLabel}
						</span>
					) : null}
					<span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600">
						<Clock className="h-3.5 w-3.5" aria-hidden="true" />
						{lastRefresh}
					</span>
					<SegmentedViewToggle value={view} onChange={setView} />
				</div>
			</header>

			{error ? (
				<div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 xl:px-6">
					<div className="flex items-center gap-2">
						<AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
						<span className="truncate">{error}</span>
					</div>
				</div>
			) : null}

			{data ? (
				<div className="grid h-[calc(100vh-4rem)] min-h-[720px] grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px] xl:p-5">
					<section className="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
						{view === "topology" ? <TopologyView data={data} /> : <ClientTable data={data} />}
					</section>
					<StatsPanel data={data} />
				</div>
			) : (
				<div className="grid min-h-[calc(100vh-4rem)] place-items-center px-4">
					<div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-soft">
						<div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-blue-100 bg-blue-50">
							<RefreshCw className={`h-5 w-5 text-blue-600 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
						</div>
						<h2 className="mt-4 text-base font-semibold text-slate-950">{loading ? "Connecting to UniFi" : "UniFi unavailable"}</h2>
						<p className="mt-2 text-sm text-slate-500">{error ?? "Waiting for the first dashboard sample."}</p>
					</div>
				</div>
			)}
		</main>
	);
}
