"use client";

import { formatBps, formatNullable } from "@/lib/format";
import type { ClientSummary, DeviceIcon } from "@/lib/types";
import { ArrowDown, ArrowUp, CircuitBoard, Laptop, Monitor, Smartphone, Tablet, Wifi } from "lucide-react";

const iconMap: Record<DeviceIcon, typeof Laptop> = {
	laptop: Laptop,
	phone: Smartphone,
	tablet: Tablet,
	desktop: Monitor,
	"raspberry-pi": CircuitBoard,
	unknown: Laptop
};

function experienceClass(label: ClientSummary["experienceLabel"]) {
	if (label === "Excellent") {
		return "bg-emerald-500";
	}

	if (label === "Good") {
		return "bg-lime-500";
	}

	if (label === "Fair") {
		return "bg-amber-500";
	}

	if (label === "Poor") {
		return "bg-rose-500";
	}

	return "bg-slate-300";
}

function compactRate(value: number) {
	return value > 0 ? formatBps(value) : "—";
}

export function ClientFlow({ clients }: { clients: ClientSummary[] }) {
	return (
		<section className="relative">
			{clients.length === 0 ? (
				<div className="mx-auto max-w-sm rounded-lg border border-dashed border-slate-300 bg-white/75 px-6 py-5 text-center text-sm text-slate-500">No connected clients reported.</div>
			) : (
				<div className="mx-auto grid w-full max-w-[1120px] grid-cols-5 gap-2.5">
					{clients.map((client, index) => {
						const Icon = iconMap[client.deviceIcon] ?? Laptop;
						return (
							<article key={client.id} className="relative min-h-[132px] min-w-0 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-soft backdrop-blur">
								<div className="absolute -top-5 left-1/2 h-5 w-px -translate-x-1/2 bg-gradient-to-b from-transparent to-slate-200" />
								<div className="flex items-start justify-between gap-2">
									<div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50">
										<Icon className="h-4 w-4 text-slate-700" strokeWidth={1.8} aria-hidden="true" />
									</div>
									<div className="flex min-w-0 flex-col items-end gap-1.5">
										<span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-blue-700">#{index + 1}</span>
										<div className="flex max-w-full flex-wrap justify-end gap-1">
											{client.wifiGeneration ? (
												<span className="rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">{client.wifiGeneration}</span>
											) : null}
											{client.ssid ? (
												<span className="max-w-24 truncate rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{client.ssid}</span>
											) : null}
										</div>
									</div>
								</div>

								<div className="mt-3 min-w-0">
									<div className="flex min-w-0 items-center gap-2">
										<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${experienceClass(client.experienceLabel)}`} />
										<h3 className="truncate text-xs font-semibold text-slate-950">{client.name}</h3>
									</div>
									<div className="mt-1 truncate text-[11px] text-slate-500">{formatNullable(client.ip)}</div>
								</div>

								<div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-500">
									<span className="inline-flex min-w-0 items-center gap-1 truncate">
										<Wifi className="h-3 w-3 shrink-0" aria-hidden="true" />
										<span className="truncate">{client.band ?? client.technology ?? "WiFi"}</span>
									</span>
									<div className="flex shrink-0 items-center gap-1.5">
										<span className="inline-flex items-center gap-0.5 font-medium tabular-nums text-blue-700">
											<ArrowDown className="h-2.5 w-2.5" aria-hidden="true" />
											{compactRate(client.downloadBps)}
										</span>
										<span className="inline-flex items-center gap-0.5 font-medium tabular-nums text-violet-700">
											<ArrowUp className="h-2.5 w-2.5" aria-hidden="true" />
											{compactRate(client.uploadBps)}
										</span>
									</div>
								</div>
							</article>
						);
					})}
				</div>
			)}
		</section>
	);
}
