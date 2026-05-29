"use client";

import { Network, Table2 } from "lucide-react";

export type DashboardView = "topology" | "table";

export function SegmentedViewToggle({ value, onChange }: { value: DashboardView; onChange: (value: DashboardView) => void }) {
	const items = [
		{ value: "topology" as const, label: "Topology", icon: Network },
		{ value: "table" as const, label: "Table", icon: Table2 }
	];

	return (
		<div className="inline-grid grid-cols-2 rounded-full border border-slate-200 bg-slate-100 p-0.5">
			{items.map(item => {
				const Icon = item.icon;
				const selected = value === item.value;
				return (
					<button
						key={item.value}
						type="button"
						onClick={() => onChange(item.value)}
						className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${
							selected ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"
						}`}
						aria-pressed={selected}
					>
						<Icon className="h-3.5 w-3.5" aria-hidden="true" />
						<span>{item.label}</span>
					</button>
				);
			})}
		</div>
	);
}
