import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "UniFi Office Dashboard",
	description: "Local UniFi office screen dashboard"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
