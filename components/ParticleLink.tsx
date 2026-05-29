"use client";

import { motion } from "framer-motion";

export function ParticleLink({ orientation, className = "", delay = 0, tone = "blue" }: { orientation: "vertical" | "horizontal"; className?: string; delay?: number; tone?: "blue" | "purple" }) {
	const isVertical = orientation === "vertical";
	const particleColor = tone === "blue" ? "bg-blue-500 shadow-[0_0_12px_rgba(0,111,255,0.45)]" : "bg-violet-500 shadow-[0_0_12px_rgba(124,58,237,0.45)]";

	return (
		<div className={`pointer-events-none absolute overflow-hidden ${className}`}>
			<div
				className={
					isVertical
						? "absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-blue-200 via-slate-200 to-violet-200"
						: "absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-gradient-to-r from-blue-200 via-slate-200 to-violet-200"
				}
			/>
			{[0, 1, 2].map(index => (
				<motion.span
					key={index}
					className={`absolute h-1.5 w-1.5 rounded-full ${particleColor}`}
					initial={false}
					animate={isVertical ? { top: ["0%", "100%"], opacity: [0, 1, 0] } : { left: ["0%", "100%"], opacity: [0, 1, 0] }}
					transition={{
						duration: isVertical ? 2.7 : 3.4,
						delay: delay + index * 0.7,
						ease: "easeInOut",
						repeat: Infinity
					}}
					style={isVertical ? { left: "calc(50% - 3px)" } : { top: "calc(50% - 3px)" }}
				/>
			))}
		</div>
	);
}
