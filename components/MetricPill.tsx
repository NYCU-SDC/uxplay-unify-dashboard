"use client";

import type { ReactNode } from "react";

type Tone = "blue" | "purple" | "green" | "amber" | "gray";

const toneClass: Record<Tone, string> = {
	blue: "border-blue-100 bg-blue-50 text-blue-700",
	purple: "border-violet-100 bg-violet-50 text-violet-700",
	green: "border-emerald-100 bg-emerald-50 text-emerald-700",
	amber: "border-amber-100 bg-amber-50 text-amber-700",
	gray: "border-slate-200 bg-slate-50 text-slate-600"
};

export function MetricPill({ icon, label, value, tone = "gray" }: { icon?: ReactNode; label?: string; value: string; tone?: Tone }) {
	return (
		<span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${toneClass[tone]}`}>
			{icon ? <span className="grid h-4 w-4 shrink-0 place-items-center">{icon}</span> : null}
			{label ? <span className="text-current/70">{label}</span> : null}
			<span className="tabular-nums">{value}</span>
		</span>
	);
}
