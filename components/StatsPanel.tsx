"use client";

import { formatBps, formatBytes, formatDuration, formatNullable, formatPercent } from "@/lib/format";
import type { ClientSummary, DashboardData } from "@/lib/types";
import { AlertTriangle, ArrowDown, ArrowUp, Clock, Cpu, Gauge, HardDrive, Radio, Users, Wifi } from "lucide-react";
import { useMemo } from "react";
import { MetricPill } from "./MetricPill";

function distribution<T extends string | undefined>(items: ClientSummary[], getter: (client: ClientSummary) => T) {
	const counts = new Map<string, number>();
	for (const item of items) {
		const key = getter(item) ?? "Unknown";
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function BarList({ rows, total }: { rows: Array<[string, number]>; total: number }) {
	return (
		<div className="space-y-2">
			{rows.length === 0 ? <div className="text-sm text-slate-500">—</div> : null}
			{rows.map(([label, count]) => (
				<div key={label}>
					<div className="mb-1 flex items-center justify-between gap-3 text-xs">
						<span className="truncate font-medium text-slate-600">{label}</span>
						<span className="shrink-0 tabular-nums text-slate-500">{count}</span>
					</div>
					<div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
						<div className="h-full rounded-full bg-blue-500" style={{ width: `${total > 0 ? Math.max(6, (count / total) * 100) : 0}%` }} />
					</div>
				</div>
			))}
		</div>
	);
}

export function StatsPanel({ data }: { data: DashboardData }) {
	const primaryAp = data.aps[0];
	const topClients = useMemo(() => data.clients.slice(0, 5), [data.clients]);
	const bandDistribution = useMemo(() => distribution(data.clients, client => client.band), [data.clients]);
	const generationDistribution = useMemo(() => distribution(data.clients, client => client.wifiGeneration), [data.clients]);

	return (
		<aside className="h-full min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm thin-scrollbar">
			<div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
				<div className="flex items-center justify-between gap-3">
					<div>
						<h2 className="text-sm font-semibold text-slate-950">Live Stats</h2>
						<p className="mt-0.5 text-xs text-slate-500">{data.site.name}</p>
					</div>
					<span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{data.summary.healthLabel}</span>
				</div>
			</div>

			<div className="space-y-5 p-4">
				<section>
					<div className="grid grid-cols-2 gap-2">
						<MetricPill tone="gray" icon={<Users className="h-3.5 w-3.5" />} label="Clients" value={String(data.summary.onlineClients)} />
						<MetricPill tone="green" icon={<Wifi className="h-3.5 w-3.5" />} label="APs" value={`${data.summary.accessPointsOnline}/${data.summary.accessPointsTotal}`} />
						<MetricPill tone="blue" icon={<ArrowDown className="h-3.5 w-3.5" />} label="Down" value={formatBps(data.summary.totalDownloadBps)} />
						<MetricPill tone="purple" icon={<ArrowUp className="h-3.5 w-3.5" />} label="Up" value={formatBps(data.summary.totalUploadBps)} />
					</div>
				</section>

				<section className="border-t border-slate-100 pt-4">
					<h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">
						<Radio className="h-3.5 w-3.5" aria-hidden="true" />
						Access Point
					</h3>
					<div className="space-y-3">
						<div>
							<div className="truncate text-sm font-semibold text-slate-950">{primaryAp?.name ?? "—"}</div>
							<div className="mt-0.5 text-xs text-slate-500">{formatNullable(primaryAp?.model)}</div>
						</div>
						<div className="grid grid-cols-2 gap-2 text-xs">
							<div className="rounded-md border border-slate-200 bg-slate-50 p-2">
								<div className="flex items-center gap-1 text-slate-500">
									<Cpu className="h-3.5 w-3.5" aria-hidden="true" />
									CPU
								</div>
								<div className="mt-1 font-semibold tabular-nums text-slate-900">{formatPercent(primaryAp?.cpuPct)}</div>
							</div>
							<div className="rounded-md border border-slate-200 bg-slate-50 p-2">
								<div className="flex items-center gap-1 text-slate-500">
									<HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
									Memory
								</div>
								<div className="mt-1 font-semibold tabular-nums text-slate-900">{formatPercent(primaryAp?.memoryPct)}</div>
							</div>
							<div className="rounded-md border border-slate-200 bg-slate-50 p-2">
								<div className="flex items-center gap-1 text-slate-500">
									<Clock className="h-3.5 w-3.5" aria-hidden="true" />
									Uptime
								</div>
								<div className="mt-1 font-semibold tabular-nums text-slate-900">{formatDuration(primaryAp?.uptimeSec)}</div>
							</div>
							<div className="rounded-md border border-slate-200 bg-slate-50 p-2">
								<div className="flex items-center gap-1 text-slate-500">
									<Gauge className="h-3.5 w-3.5" aria-hidden="true" />
									Activity
								</div>
								<div className="mt-1 font-semibold tabular-nums text-slate-900">{formatBps(primaryAp?.activityBps)}</div>
							</div>
						</div>
						<div className="space-y-2">
							{primaryAp?.radios?.length ? (
								primaryAp.radios.map(radio => (
									<div key={`${radio.band ?? "radio"}-${radio.channel ?? "auto"}`} className="rounded-md border border-slate-200 p-2">
										<div className="flex items-center justify-between gap-2 text-xs">
											<span className="font-medium text-slate-700">{radio.band ?? "Radio"}</span>
											<span className="text-slate-500">Ch {formatNullable(radio.channel)}</span>
										</div>
										<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
											<div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(0, Math.min(100, radio.channelUtilizationPct ?? 0))}%` }} />
										</div>
										<div className="mt-1 text-xs text-slate-500">Utilization {formatPercent(radio.channelUtilizationPct)}</div>
									</div>
								))
							) : (
								<div className="text-sm text-slate-500">No radio statistics reported.</div>
							)}
						</div>
					</div>
				</section>

				<section className="border-t border-slate-100 pt-4">
					<h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">Top Clients</h3>
					<div className="space-y-2">
						{topClients.map(client => (
							<div key={client.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
								<div className="min-w-0">
									<div className="truncate text-sm font-medium text-slate-800">{client.name}</div>
									<div className="text-xs text-slate-500">{formatBytes(client.usage24hBytes)}</div>
								</div>
								<div className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatBps(client.activityBps)}</div>
							</div>
						))}
						{topClients.length === 0 ? <div className="text-sm text-slate-500">No active clients.</div> : null}
					</div>
				</section>

				<section className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4">
					<div>
						<h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">Bands</h3>
						<BarList rows={bandDistribution} total={data.clients.length} />
					</div>
					<div>
						<h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">WiFi Generation</h3>
						<BarList rows={generationDistribution} total={data.clients.length} />
					</div>
				</section>

				<section className="border-t border-slate-100 pt-4">
					<h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">
						<AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
						Warnings / Events
					</h3>
					<div className="space-y-2">
						{data.warnings.slice(0, 4).map(warning => (
							<div key={warning} className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
								{warning}
							</div>
						))}
						{data.events.slice(0, 5).map(event => (
							<div key={event.id} className="rounded-md border border-slate-200 px-3 py-2">
								<div className="text-xs font-medium text-slate-800">{event.message}</div>
								<div className="mt-1 text-[11px] text-slate-500">{new Date(event.time).toLocaleTimeString()}</div>
							</div>
						))}
						{data.warnings.length === 0 && data.events.length === 0 ? <div className="text-sm text-slate-500">No warnings or events.</div> : null}
					</div>
				</section>
			</div>
		</aside>
	);
}
