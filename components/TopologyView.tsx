"use client";

import { formatBps } from "@/lib/format";
import type { DashboardData } from "@/lib/types";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ApNode } from "./ApNode";
import { ClientNode } from "./ClientNode";
import { MetricPill } from "./MetricPill";
import { ParticleLink } from "./ParticleLink";

export function TopologyView({ data }: { data: DashboardData }) {
	const primaryAp = data.aps[0];
	const clients = data.clients.slice(0, 18);

	return (
		<div className="relative h-full min-h-[640px] overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(0,111,255,0.08),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-5 py-6">
			<div className="absolute left-8 right-8 top-[19.4rem] h-px bg-slate-200" />
			<div className="absolute left-8 right-8 top-[19.4rem] h-8 bg-gradient-to-b from-blue-50/60 to-transparent" />
			<ParticleLink orientation="vertical" tone="blue" className="left-1/2 top-[9.5rem] h-40 w-10 -translate-x-1/2" />
			<ParticleLink orientation="horizontal" tone="purple" className="left-[8%] right-[8%] top-[18.7rem] h-6" delay={0.35} />

			<div className="relative z-10 flex flex-col items-center">
				<ApNode ap={primaryAp} />
				<div className="mt-4 flex flex-wrap items-center justify-center gap-2">
					<MetricPill tone="blue" icon={<ArrowDown className="h-3.5 w-3.5" />} label="Down" value={formatBps(data.summary.totalDownloadBps)} />
					<MetricPill tone="purple" icon={<ArrowUp className="h-3.5 w-3.5" />} label="Up" value={formatBps(data.summary.totalUploadBps)} />
				</div>
			</div>

			<div className="relative z-10 mt-24 grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4 xl:grid-cols-4 2xl:grid-cols-6">
				{clients.map((client, index) => (
					<ClientNode key={client.id} client={client} index={index} />
				))}
				{clients.length === 0 ? (
					<div className="col-span-full mx-auto mt-12 rounded-lg border border-dashed border-slate-300 bg-white/70 px-6 py-5 text-center text-sm text-slate-500">No connected clients reported.</div>
				) : null}
			</div>
		</div>
	);
}
