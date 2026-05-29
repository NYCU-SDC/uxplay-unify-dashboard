"use client";

import { formatBps, formatBytes, formatDuration, formatNullable } from "@/lib/format";
import type { DashboardData, HealthLabel } from "@/lib/types";
import { ArrowDown, ArrowUp } from "lucide-react";

const columns = ["", "Name", "Connection/AP", "Network", "WiFi / SSID", "Experience", "Technology", "Channel", "IP Address", "Activity", "Download", "Upload", "24h Usage", "Connected Time"];

function experienceClass(label: HealthLabel) {
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

	return "border-slate-200 bg-slate-50 text-slate-500";
}

export function ClientTable({ data }: { data: DashboardData }) {
	return (
		<div className="h-full overflow-auto thin-scrollbar">
			<table className="w-full min-w-[1380px] border-separate border-spacing-0 text-left text-sm">
				<thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
					<tr>
						{columns.map(column => (
							<th key={column} className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">
								{column}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="bg-white">
					{data.clients.map(client => (
						<tr key={client.id} className="group border-b border-slate-100 transition hover:bg-blue-50/35">
							<td className="border-b border-slate-100 px-4 py-3">
								<span className={`block h-2.5 w-2.5 rounded-full ${client.isOnline ? "bg-emerald-500" : "bg-slate-300"}`} />
							</td>
							<td className="border-b border-slate-100 px-4 py-3">
								<div className="max-w-[220px]">
									<div className="truncate font-medium text-slate-950">{client.name}</div>
									<div className="mt-0.5 truncate text-xs text-slate-500">{client.macMasked}</div>
								</div>
							</td>
							<td className="border-b border-slate-100 px-4 py-3 text-slate-600">{formatNullable(client.apName)}</td>
							<td className="border-b border-slate-100 px-4 py-3 text-slate-600">{formatNullable(client.network)}</td>
							<td className="border-b border-slate-100 px-4 py-3">
								<div className="flex max-w-[180px] flex-wrap gap-1.5">
									{client.wifiGeneration ? <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{client.wifiGeneration}</span> : null}
									<span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">{formatNullable(client.ssid)}</span>
								</div>
							</td>
							<td className="border-b border-slate-100 px-4 py-3">
								<span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${experienceClass(client.experienceLabel)}`}>{client.experienceLabel}</span>
							</td>
							<td className="border-b border-slate-100 px-4 py-3 text-slate-600">{formatNullable(client.technology ?? client.band)}</td>
							<td className="border-b border-slate-100 px-4 py-3 text-slate-600">
								{formatNullable(client.channel)}
								{client.channelWidthMHz ? <span className="ml-1 text-xs text-slate-400">{client.channelWidthMHz} MHz</span> : null}
							</td>
							<td className="border-b border-slate-100 px-4 py-3 font-mono text-xs text-slate-600">{formatNullable(client.ip)}</td>
							<td className="border-b border-slate-100 px-4 py-3 font-medium tabular-nums text-slate-800">{formatBps(client.activityBps)}</td>
							<td className="border-b border-slate-100 px-4 py-3 tabular-nums text-blue-700">
								<span className="inline-flex items-center gap-1">
									<ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
									{formatBps(client.downloadBps)}
								</span>
							</td>
							<td className="border-b border-slate-100 px-4 py-3 tabular-nums text-violet-700">
								<span className="inline-flex items-center gap-1">
									<ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
									{formatBps(client.uploadBps)}
								</span>
							</td>
							<td className="border-b border-slate-100 px-4 py-3 tabular-nums text-slate-600">{formatBytes(client.usage24hBytes)}</td>
							<td className="border-b border-slate-100 px-4 py-3 tabular-nums text-slate-600">{formatDuration(client.connectedSeconds)}</td>
						</tr>
					))}
					{data.clients.length === 0 ? (
						<tr>
							<td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-slate-500">
								No clients reported.
							</td>
						</tr>
					) : null}
				</tbody>
			</table>
		</div>
	);
}
