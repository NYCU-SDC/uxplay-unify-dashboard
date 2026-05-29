import type { Config } from "tailwindcss";

const config: Config = {
	content: ["./index.html", "./src/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
	theme: {
		extend: {
			colors: {
				unifi: {
					blue: "#006FFF",
					purple: "#7C3AED",
					line: "#D9E1EC",
					mist: "#F5F7FA"
				}
			},
			boxShadow: {
				soft: "0 18px 60px rgba(15, 23, 42, 0.08)",
				node: "0 14px 36px rgba(15, 23, 42, 0.1)"
			}
		}
	},
	plugins: []
};

export default config;
