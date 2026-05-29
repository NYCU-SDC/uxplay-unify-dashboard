import { ClientFlow } from "@/components/ClientFlow";
import { MetricPill } from "@/components/MetricPill";
import { formatBps, formatNullable } from "@/lib/format";
import type { DashboardData } from "@/lib/types";
import { Airplay, AlertTriangle, ArrowDown, ArrowUp, Clock, RefreshCw, ShieldCheck, Users, Wifi } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const FALLBACK_POLL_MS = 5000;
const WALLPAPER_POLL_MS = 60_000;

interface WallpaperData {
	image: string;
	link: string;
	refreshedAt: string;
	warning?: string;
}

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

async function readWallpaper(signal?: AbortSignal) {
	const response = await fetch("/api/wallpaper", {
		cache: "no-store",
		signal
	});
	const payload = (await response.json().catch(() => null)) as WallpaperData | { error?: string } | null;

	if (!response.ok) {
		throw new Error(payload && "error" in payload && payload.error ? payload.error : `Wallpaper request failed with ${response.status}.`);
	}

	return payload as WallpaperData;
}

function loadImage(src: string, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		const image = new Image();
		const cleanup = () => {
			image.onload = null;
			image.onerror = null;
			signal?.removeEventListener("abort", onAbort);
		};
		const onAbort = () => {
			cleanup();
			reject(new DOMException("Aborted", "AbortError"));
		};

		if (signal?.aborted) {
			onAbort();
			return;
		}

		signal?.addEventListener("abort", onAbort, { once: true });
		image.onload = () => {
			cleanup();
			resolve();
		};
		image.onerror = () => {
			cleanup();
			reject(new Error("Wallpaper image failed to load."));
		};
		image.src = src;
	});
}

export function App() {
	const [data, setData] = useState<DashboardData | null>(null);
	const [wallpaper, setWallpaper] = useState<WallpaperData | null>(null);
	const [previousWallpaper, setPreviousWallpaper] = useState<WallpaperData | null>(null);
	const [wallpaperVisible, setWallpaperVisible] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [wallpaperError, setWallpaperError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [now, setNow] = useState(() => Date.now());
	const pollMsRef = useRef(FALLBACK_POLL_MS);
	const refreshWallpaperRef = useRef<(() => void) | null>(null);
	const wallpaperRef = useRef<WallpaperData | null>(null);
	const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const applyWallpaper = (nextWallpaper: WallpaperData) => {
		const currentWallpaper = wallpaperRef.current;
		if (currentWallpaper?.image === nextWallpaper.image) {
			wallpaperRef.current = nextWallpaper;
			setWallpaper(nextWallpaper);
			setWallpaperVisible(true);
			return;
		}

		if (fadeTimeoutRef.current) {
			clearTimeout(fadeTimeoutRef.current);
		}

		setPreviousWallpaper(currentWallpaper);
		setWallpaper(nextWallpaper);
		wallpaperRef.current = nextWallpaper;
		setWallpaperVisible(false);

		requestAnimationFrame(() => {
			requestAnimationFrame(() => setWallpaperVisible(true));
		});

		fadeTimeoutRef.current = setTimeout(() => {
			setPreviousWallpaper(null);
		}, 1400);
	};

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
		let cancelled = false;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		let controller: AbortController | undefined;
		let running = false;
		let rerunRequested = false;

		const clearScheduledRun = () => {
			if (timeout) {
				clearTimeout(timeout);
				timeout = undefined;
			}
		};

		const scheduleRun = () => {
			clearScheduledRun();
			timeout = setTimeout(run, WALLPAPER_POLL_MS);
		};

		const run = async () => {
			if (running) {
				rerunRequested = true;
				return;
			}

			running = true;
			clearScheduledRun();
			controller = new AbortController();
			try {
				const nextWallpaper = await readWallpaper(controller.signal);
				await loadImage(nextWallpaper.image, controller.signal);
				if (cancelled) {
					return;
				}

				applyWallpaper(nextWallpaper);
				setWallpaperError(nextWallpaper.warning && !wallpaperRef.current ? nextWallpaper.warning : null);
			} catch (requestError) {
				if (!cancelled && !(requestError instanceof DOMException && requestError.name === "AbortError")) {
					setWallpaperError(wallpaperRef.current ? null : requestError instanceof Error ? requestError.message : "Wallpaper request failed.");
				}
			} finally {
				running = false;
				if (!cancelled) {
					if (rerunRequested) {
						rerunRequested = false;
						void run();
					} else {
						scheduleRun();
					}
				}
			}
		};

		refreshWallpaperRef.current = () => {
			clearScheduledRun();
			if (running) {
				rerunRequested = true;
				controller?.abort();
				return;
			}

			void run();
		};

		run();

		return () => {
			cancelled = true;
			refreshWallpaperRef.current = null;
			controller?.abort();
			clearScheduledRun();
		};
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.repeat || (event.code !== "Space" && event.key !== " ")) {
				return;
			}

			const target = event.target instanceof HTMLElement ? event.target : null;
			if (target?.closest("input, textarea, select, button, [contenteditable='true']")) {
				return;
			}

			event.preventDefault();
			refreshWallpaperRef.current?.();
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	useEffect(() => {
		return () => {
			if (fadeTimeoutRef.current) {
				clearTimeout(fadeTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(interval);
	}, []);

	const lastRefresh = useMemo(() => ageLabel(data?.refreshedAt, now), [data?.refreshedAt, now]);
	const primaryAp = data?.aps[0];
	const clients = data?.clients.slice(0, 8) ?? [];

	return (
		<main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
			{previousWallpaper ? <img key={`previous-${previousWallpaper.image}`} src={previousWallpaper.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-100" /> : null}
			{wallpaper ? (
				<img
					key={`current-${wallpaper.image}`}
					src={wallpaper.image}
					alt=""
					className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-out ${wallpaperVisible ? "opacity-100" : "opacity-0"}`}
				/>
			) : null}
			<div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.82)_0%,rgba(15,23,42,0.58)_43%,rgba(15,23,42,0.34)_72%,rgba(15,23,42,0.58)_100%)]" />
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_28%,rgba(255,255,255,0.18),transparent_26rem),radial-gradient(circle_at_72%_78%,rgba(0,111,255,0.18),transparent_24rem)]" />

			<div className="pointer-events-none absolute right-6 top-5 z-30 flex items-center gap-2">
				{data ? (
					<span className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium shadow-sm backdrop-blur ${healthClass(data.summary.healthLabel)}`}>
						<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
						{data.summary.healthLabel}
					</span>
				) : null}
				<span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/18 bg-white/14 px-3 text-xs font-medium text-white/85 shadow-sm backdrop-blur-xl">
					<Clock className="h-3.5 w-3.5" aria-hidden="true" />
					{lastRefresh}
				</span>
			</div>

			<div className="relative z-10 grid min-h-screen grid-rows-[1fr_auto] px-8 pb-7 pt-20">
				<div className="grid grid-cols-[minmax(0,1fr)_25rem] items-center gap-8">
					<section className="max-w-3xl">
						<div className="inline-flex rounded-full border border-white/18 bg-white/14 px-3 py-1 text-xs font-medium uppercase text-white/75 backdrop-blur-xl">Office Screen</div>
						<h1 className="mt-6 max-w-2xl text-6xl font-semibold leading-[0.98] text-white drop-shadow-[0_8px_28px_rgba(0,0,0,0.28)]">SDC Dashboard</h1>

						<div className="mt-10 grid max-w-2xl grid-cols-2 gap-4">
							<div className="rounded-lg border border-white/16 bg-white/18 p-5 shadow-soft backdrop-blur-2xl">
								<div className="flex items-center gap-2 text-sm font-medium text-white/72">
									<Wifi className="h-4 w-4 text-blue-200" aria-hidden="true" />
									Wi-Fi Username/Password
								</div>
								<div className="mt-3 text-4xl font-semibold text-white">BambooFox</div>
							</div>

							<div className="rounded-lg border border-white/16 bg-white/18 p-5 shadow-soft backdrop-blur-2xl">
								<div className="flex items-center gap-2 text-sm font-medium text-white/72">
									<Airplay className="h-4 w-4 text-violet-200" aria-hidden="true" />
									AirPlay 螢幕投影 (要連 Wi-Fi)
								</div>
								<div className="mt-3 text-4xl font-semibold text-white">UxPlay@SDC</div>
							</div>
						</div>
					</section>

					<aside className="rounded-lg border border-white/18 bg-slate-950/38 p-5 text-white shadow-soft backdrop-blur-2xl">
						<div className="flex items-start justify-between gap-4">
							<div>
								<div className="text-xs font-semibold uppercase text-white/55">Network Status</div>
								<div className="mt-2 text-2xl font-semibold text-white">{primaryAp?.name ?? "UniFi AP"}</div>
								<div className="mt-1 text-sm text-white/62">
									{formatNullable(primaryAp?.model)} · {formatNullable(primaryAp?.ip)}
								</div>
							</div>
							<div className="grid h-12 w-12 place-items-center rounded-full border border-white/18 bg-white/14">
								<Wifi className="h-6 w-6 text-blue-200" aria-hidden="true" />
							</div>
						</div>

						<div className="mt-5 grid grid-cols-2 gap-2">
							<MetricPill tone="blue" icon={<ArrowDown className="h-3.5 w-3.5" />} label="Down" value={formatBps(data?.summary.totalDownloadBps)} />
							<MetricPill tone="purple" icon={<ArrowUp className="h-3.5 w-3.5" />} label="Up" value={formatBps(data?.summary.totalUploadBps)} />
							<MetricPill tone="green" icon={<Users className="h-3.5 w-3.5" />} label="Clients" value={String(data?.summary.onlineClients ?? 0)} />
							<MetricPill tone="gray" icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Health" value={data?.summary.healthLabel ?? "Unknown"} />
						</div>

						{loading && !data ? (
							<div className="mt-4 flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
								<RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
								Connecting to UniFi
							</div>
						) : null}
					</aside>
				</div>

				<div className="mt-7">
					<ClientFlow clients={clients} />
				</div>
			</div>

			{error || wallpaperError ? (
				<div className="pointer-events-none absolute left-1/2 top-16 z-30 w-[min(760px,calc(100vw-3rem))] -translate-x-1/2 rounded-lg border border-amber-200 bg-amber-50/95 px-4 py-2 text-sm text-amber-900 shadow-sm backdrop-blur">
					<div className="flex items-center gap-2">
						<AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
						<span className="truncate">{error ?? wallpaperError}</span>
					</div>
				</div>
			) : null}
		</main>
	);
}
