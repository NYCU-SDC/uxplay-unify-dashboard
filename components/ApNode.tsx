"use client";

import { formatPercent } from "@/lib/format";
import type { AccessPointSummary } from "@/lib/types";
import { motion } from "framer-motion";
import { Cpu, HardDrive, Radio, Wifi } from "lucide-react";
import { MetricPill } from "./MetricPill";

export function ApNode({ ap }: { ap?: AccessPointSummary }) {
	const online = !["offline", "disconnected", "down", "failed"].includes((ap?.status ?? ap?.state ?? "").toLowerCase());

	return (
		<motion.div className="flex flex-col items-center text-center" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
			<div className="relative grid h-24 w-24 place-items-center rounded-full border border-slate-200 bg-white shadow-node">
				<div className={`absolute inset-[-10px] rounded-full ${online ? "bg-blue-500/10" : "bg-slate-400/10"} blur-xl`} />
				<div className="relative grid h-16 w-16 place-items-center rounded-full border border-slate-100 bg-slate-50">
					<Wifi className={online ? "h-9 w-9 text-blue-600" : "h-9 w-9 text-slate-400"} strokeWidth={1.7} aria-hidden="true" />
				</div>
			</div>
			<div className="mt-3 inline-flex max-w-[36rem] items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
				<span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"}`} />
				<span className="truncate text-sm font-semibold text-slate-950">{ap?.name ?? "Access Point"}</span>
				<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{ap?.model ?? "AP"}</span>
			</div>
			<div className="mt-3 flex flex-wrap items-center justify-center gap-2">
				<MetricPill tone="gray" icon={<Radio className="h-3.5 w-3.5" />} label="Clients" value={String(ap?.clientCount ?? 0)} />
				<MetricPill tone="blue" icon={<Cpu className="h-3.5 w-3.5" />} label="CPU" value={formatPercent(ap?.cpuPct)} />
				<MetricPill tone="purple" icon={<HardDrive className="h-3.5 w-3.5" />} label="Memory" value={formatPercent(ap?.memoryPct)} />
			</div>
		</motion.div>
	);
}
