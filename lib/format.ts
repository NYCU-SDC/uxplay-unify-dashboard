const DASH = "—";

function isFiniteNumber(value: number | null | undefined): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function formatScaled(value: number, units: string[], decimals = 1) {
	let scaled = Math.abs(value);
	let unitIndex = 0;

	while (scaled >= 1000 && unitIndex < units.length - 1) {
		scaled /= 1000;
		unitIndex += 1;
	}

	const sign = value < 0 ? "-" : "";
	const digits = scaled >= 100 || unitIndex === 0 ? 0 : decimals;
	return `${sign}${scaled.toFixed(digits)} ${units[unitIndex]}`;
}

export function formatBps(value: number | null | undefined) {
	if (!isFiniteNumber(value)) {
		return DASH;
	}

	const rounded = Math.max(0, value);
	if (rounded < 1000) {
		return `${Math.round(rounded)} bps`;
	}

	return formatScaled(rounded, ["bps", "Kbps", "Mbps", "Gbps", "Tbps"]);
}

export function formatBytes(value: number | null | undefined) {
	if (!isFiniteNumber(value)) {
		return DASH;
	}

	const rounded = Math.max(0, value);
	if (rounded < 1000) {
		return `${Math.round(rounded)} B`;
	}

	return formatScaled(rounded, ["B", "KB", "MB", "GB", "TB", "PB"]);
}

export function formatDuration(seconds: number | null | undefined) {
	if (!isFiniteNumber(seconds)) {
		return DASH;
	}

	let remaining = Math.max(0, Math.floor(seconds));
	const days = Math.floor(remaining / 86400);
	remaining -= days * 86400;
	const hours = Math.floor(remaining / 3600);
	remaining -= hours * 3600;
	const minutes = Math.floor(remaining / 60);
	remaining -= minutes * 60;

	if (days > 0) {
		return `${days}d ${hours}h ${minutes}m`;
	}

	if (hours > 0) {
		return `${hours}h ${minutes}m ${remaining}s`;
	}

	if (minutes > 0) {
		return `${minutes}m ${remaining}s`;
	}

	return `${remaining}s`;
}

export function formatPercent(value: number | null | undefined) {
	if (!isFiniteNumber(value)) {
		return DASH;
	}

	return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
}

export function formatNullable(value: string | number | null | undefined) {
	if (value === null || value === undefined || value === "") {
		return DASH;
	}

	return String(value);
}
