/**
 * @fileoverview
 * 插件的主入口文件
 */

import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "./App.tsx";
import { initLogger } from "./utils/logger";
import { setupGlobalLogAPI } from "./utils/logApi";

initLogger({
	maxEntries: 500,
	enableConsole: true,
});

setupGlobalLogAPI();

const configElement = document.createElement("div");
let configRoot: Root | null = null;

configElement.style.height = "100%";
configElement.style.maxHeight = "100%";
configElement.style.overflowY = "auto";
configElement.style.overflowX = "hidden";
configElement.style.boxSizing = "border-box";

function resetDevViewState() {
	if (!import.meta.env.DEV) return;

	try {
		// BetterNCM dev mode can leave Chromium zoom/device-emulation state dirty
		// after repeated reloads. Reset the obvious page-level knobs on each load.
		document.body.style.zoom = "";
		document.documentElement.style.zoom = "";
		document.body.style.transform = "";
		document.documentElement.style.transform = "";
		document.body.style.transformOrigin = "";
		document.documentElement.style.transformOrigin = "";

		const viewportMeta = document.querySelector('meta[name="viewport"]');
		if (viewportMeta) {
			viewportMeta.setAttribute(
				"content",
				"width=device-width, initial-scale=1, maximum-scale=1",
			);
		}
	} catch (error) {
		console.warn("[Dev] 重置页面缩放状态失败", error);
	}
}

plugin.onLoad(() => {
	try {
		resetDevViewState();

		if (!configRoot) {
			configRoot = createRoot(configElement);
		}

		configRoot.render(
			<StrictMode>
				<App />
			</StrictMode>,
		);
	} catch (error) {
		console.error("React 组件渲染失败:", error);
	}
});

plugin.onConfig(() => {
	return configElement;
});
