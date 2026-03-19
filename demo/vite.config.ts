import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
	resolve: {
		alias: {
			"@penguverse/core": path.resolve(__dirname, "../packages/core/src/index.ts"),
		},
	},
	server: {
		port: 5173,
		proxy: {
			"/ws": {
				target: "ws://localhost:4321",
				ws: true,
			},
			"/api": {
				target: "http://localhost:4321",
			},
		},
	},
});
