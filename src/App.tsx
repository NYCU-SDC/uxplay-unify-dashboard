import { TopologyView } from "@/components/TopologyView";
import type { DashboardData } from "@/lib/types";
import { AlertTriangle, Clock, RefreshCw, Server, ShieldCheck } from "lucide-react";
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

	return "border-slate-200 bg-white/80 text-slate-600";
}

function ageLabel(refreshedAt: string | undefined, now: number) {
	if (!refreshedAt) {
		return "waiting";
	}

	const age = Math.max(0, Math.round((now - Date.parse(refreshedAt)) / 1000));
	if (age < 60) {
		return `${age}s ago`;
	}

	return `${Math.floor(age / 60)}m ${age % 60}s ago`;
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

export function App() {
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

	if (!data) {
		return (
			<main className="grid min-h-screen place-items-center bg-[#f5f7fa] px-4 text-slate-950">
				<div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-soft">
					<div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-blue-100 bg-blue-50">
						<RefreshCw className={`h-5 w-5 text-blue-600 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
					</div>
					<h1 className="mt-4 text-base font-semibold text-slate-950">{loading ? "Connecting to UniFi" : "UniFi unavailable"}</h1>
					<p className="mt-2 text-sm text-slate-500">{error ?? "Waiting for the first dashboard sample."}</p>
				</div>
			</main>
		);
	}

	return (
		<main className="relative min-h-screen overflow-hidden bg-[#f5f7fa] text-slate-950">
			<TopologyView data={data} />

			<div className="pointer-events-none absolute left-6 top-5 z-30 flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
				<Server className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
				<span>SDC 網路儀表板</span>
				<span className="text-slate-300">·</span>
				<span>{data.site.name}</span>
				{data.controller.applicationVersion ? <span>Network {data.controller.applicationVersion}</span> : null}
			</div>

			<div className="pointer-events-none absolute right-6 top-5 z-30 flex items-center gap-2">
				<span className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium shadow-sm backdrop-blur ${healthClass(data.summary.healthLabel)}`}>
					<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
					{data.summary.healthLabel}
				</span>
				<span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
					<Clock className="h-3.5 w-3.5" aria-hidden="true" />
					{lastRefresh}
				</span>
			</div>

			{error ? (
				<div className="pointer-events-none absolute left-1/2 top-16 z-30 w-[min(760px,calc(100vw-3rem))] -translate-x-1/2 rounded-lg border border-amber-200 bg-amber-50/95 px-4 py-2 text-sm text-amber-900 shadow-sm backdrop-blur">
					<div className="flex items-center gap-2">
						<AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
						<span className="truncate">{error}</span>
					</div>
				</div>
			) : null}
		</main>
	);
}
