"use client";

import { formatBps, formatNullable } from "@/lib/format";
import type { ClientSummary, DeviceIcon } from "@/lib/types";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, CircuitBoard, Laptop, Monitor, Smartphone, Tablet, Wifi } from "lucide-react";

const iconMap: Record<DeviceIcon, typeof Laptop> = {
	laptop: Laptop,
	phone: Smartphone,
	tablet: Tablet,
	desktop: Monitor,
	"raspberry-pi": CircuitBoard,
	unknown: Laptop
};

function healthColor(label: ClientSummary["experienceLabel"]) {
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

export function ClientNode({ client, index }: { client: ClientSummary; index: number }) {
	const Icon = iconMap[client.deviceIcon] ?? Laptop;

	return (
		<motion.article
			layout
			initial={{ opacity: 0, y: 14 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.28, delay: Math.min(index * 0.025, 0.2) }}
			className="relative min-h-[172px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-node"
		>
			<div className="absolute -top-10 left-1/2 h-10 w-px -translate-x-1/2 bg-gradient-to-b from-slate-200 to-transparent" />
			<div className="flex items-start justify-between gap-3">
				<div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50">
					<Icon className="h-5 w-5 text-slate-700" strokeWidth={1.8} aria-hidden="true" />
				</div>
				<div className="flex min-w-0 flex-1 flex-col items-end gap-1.5">
					<div className="flex max-w-full flex-wrap justify-end gap-1.5">
						{client.wifiGeneration ? <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">{client.wifiGeneration}</span> : null}
						{client.ssid ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">{client.ssid}</span> : null}
					</div>
					<span className={`h-2 w-2 rounded-full ${healthColor(client.experienceLabel)}`} />
				</div>
			</div>
			<div className="mt-4 min-w-0">
				<h3 className="truncate text-sm font-semibold text-slate-950">{client.name}</h3>
				<p className="mt-1 truncate text-xs text-slate-500">{formatNullable(client.ip)}</p>
			</div>
			<div className="mt-4 grid grid-cols-2 gap-2">
				<div className="min-w-0 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-2">
					<div className="flex items-center gap-1 text-[11px] font-medium text-blue-600">
						<ArrowDown className="h-3 w-3" aria-hidden="true" />
						<span>Download</span>
					</div>
					<div className="mt-1 truncate text-xs font-semibold tabular-nums text-blue-700">{formatBps(client.downloadBps)}</div>
				</div>
				<div className="min-w-0 rounded-md border border-violet-100 bg-violet-50 px-2.5 py-2">
					<div className="flex items-center gap-1 text-[11px] font-medium text-violet-600">
						<ArrowUp className="h-3 w-3" aria-hidden="true" />
						<span>Upload</span>
					</div>
					<div className="mt-1 truncate text-xs font-semibold tabular-nums text-violet-700">{formatBps(client.uploadBps)}</div>
				</div>
			</div>
			<div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
				<span className="inline-flex min-w-0 items-center gap-1 truncate">
					<Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span className="truncate">{client.band ?? client.technology ?? "WiFi"}</span>
				</span>
				<span className="shrink-0 font-medium text-slate-600">{client.experienceLabel}</span>
			</div>
		</motion.article>
	);
}
