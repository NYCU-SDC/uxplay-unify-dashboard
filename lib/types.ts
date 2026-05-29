export type HealthLabel = "Excellent" | "Good" | "Fair" | "Poor" | "Unknown";
export type Severity = "info" | "warning" | "error";
export type DeviceIcon = "laptop" | "phone" | "tablet" | "desktop" | "raspberry-pi" | "unknown";

export interface SiteSummary {
	id: string;
	name: string;
	internalReference?: string;
}

export interface RadioSummary {
	band?: "2.4 GHz" | "5 GHz" | "6 GHz" | string;
	channel?: string | number;
	channelWidthMHz?: number;
	channelUtilizationPct?: number;
	txPower?: string | number;
	noiseDbm?: number;
}

export interface AccessPointSummary {
	id: string;
	name: string;
	model?: string;
	state?: string;
	status?: string;
	ip?: string;
	mac?: string;
	firmware?: string;
	uptimeSec?: number;
	cpuPct?: number;
	memoryPct?: number;
	downloadBps?: number;
	uploadBps?: number;
	activityBps?: number;
	clientCount?: number;
	radios?: RadioSummary[];
}

export interface ClientSummary {
	id: string;
	name: string;
	hostname?: string;
	ip?: string;
	macMasked: string;
	apId?: string;
	apName?: string;
	ssid?: string;
	network?: string;
	experienceLabel: HealthLabel;
	experienceScore?: number;
	wifiGeneration?: "WiFi 4" | "WiFi 5" | "WiFi 6" | "WiFi 6E" | "WiFi 7" | string;
	technology?: string;
	band?: string;
	channel?: string;
	channelWidthMHz?: number;
	mimo?: string;
	rssiDbm?: number;
	signalPct?: number;
	downloadBps: number;
	uploadBps: number;
	activityBps: number;
	txRateBps?: number;
	rxRateBps?: number;
	txBytes?: number;
	rxBytes?: number;
	usage24hBytes?: number;
	connectedSeconds?: number;
	lastSeen?: string;
	isOnline: boolean;
	deviceIcon: DeviceIcon;
}

export interface WifiBroadcastSummary {
	id: string;
	name: string;
	enabled?: boolean;
}

export interface NetworkSummary {
	id: string;
	name: string;
	purpose?: string;
	vlanId?: number;
}

export interface DashboardEvent {
	id: string;
	time: string;
	message: string;
	severity: Severity;
}

export interface DashboardData {
	refreshedAt: string;
	pollMs: number;
	site: SiteSummary;
	controller: {
		baseUrlHostOnly: string;
		applicationVersion?: string;
	};
	summary: {
		onlineClients: number;
		offlineKnownClients?: number;
		accessPointsOnline: number;
		accessPointsTotal: number;
		totalDownloadBps: number;
		totalUploadBps: number;
		totalActivityBps: number;
		totalUsage24hBytes?: number;
		healthLabel: HealthLabel;
		healthScore: number;
	};
	aps: AccessPointSummary[];
	clients: ClientSummary[];
	wifiBroadcasts: WifiBroadcastSummary[];
	networks: NetworkSummary[];
	events: DashboardEvent[];
	warnings: string[];
}

export interface HealthResponse {
	ok: boolean;
	applicationVersion?: string;
	selectedSite?: SiteSummary;
	error?: string;
}
