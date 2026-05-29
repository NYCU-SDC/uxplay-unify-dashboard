"use client";

import { formatBps } from "@/lib/format";
import type { DashboardData } from "@/lib/types";
import { ArrowDown, ArrowUp, RadioTower, Users } from "lucide-react";
import { ApNode } from "./ApNode";
import { ClientFlow } from "./ClientFlow";
import { MetricPill } from "./MetricPill";
import { ParticleLink } from "./ParticleLink";

export function TopologyView({ data }: { data: DashboardData }) {
	const primaryAp = data.aps[0];
	const clients = data.clients.slice(0, 8);

	return (
		<div className="relative grid h-screen min-h-[720px] grid-rows-[auto_minmax(9rem,1fr)_auto] overflow-hidden bg-[radial-gradient(circle_at_50%_2rem,rgba(0,111,255,0.1),transparent_30rem),linear-gradient(180deg,#ffffff_0%,#f8fafc_58%,#f5f7fa_100%)] px-6 pb-6 pt-20">
			<div className="absolute left-1/2 top-[16.8rem] bottom-[15.7rem] w-24 -translate-x-1/2 rounded-full bg-blue-100/30 blur-2xl" />
			<div className="absolute left-1/2 top-[16.8rem] bottom-[15.7rem] w-px -translate-x-1/2 bg-gradient-to-b from-blue-200 via-slate-200 to-violet-200" />
			<div className="absolute left-1/2 top-[16.8rem] bottom-[15.7rem] w-10 -translate-x-1/2 bg-gradient-to-b from-blue-50/80 via-transparent to-violet-50/80" />
			<ParticleLink orientation="vertical" tone="blue" className="left-1/2 top-[16.5rem] bottom-[15.4rem] w-12 -translate-x-1/2" />
			<ParticleLink orientation="vertical" tone="purple" className="left-1/2 top-[17.5rem] bottom-[15.4rem] w-12 -translate-x-1/2" delay={0.85} />

			<div className="relative z-10 flex flex-col items-center">
				<ApNode ap={primaryAp} />
				<div className="mt-4 flex flex-wrap items-center justify-center gap-2">
					<MetricPill tone="blue" icon={<ArrowDown className="h-3.5 w-3.5" />} label="Down" value={formatBps(data.summary.totalDownloadBps)} />
					<MetricPill tone="purple" icon={<ArrowUp className="h-3.5 w-3.5" />} label="Up" value={formatBps(data.summary.totalUploadBps)} />
					<MetricPill tone="green" icon={<Users className="h-3.5 w-3.5" />} label="Clients" value={String(data.summary.onlineClients)} />
					<MetricPill tone="gray" icon={<RadioTower className="h-3.5 w-3.5" />} label="AP" value={`${data.summary.accessPointsOnline}/${data.summary.accessPointsTotal}`} />
				</div>
			</div>

			<div className="relative z-10" />

			<div className="relative z-10">
				<ClientFlow clients={clients} />
			</div>
		</div>
	);
}
