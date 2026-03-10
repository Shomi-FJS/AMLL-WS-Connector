/**
 * @fileoverview
 * 插件的主入口文件
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

const configElement = document.createElement("div");

plugin.onLoad(() => {
	try {
		createRoot(configElement).render(
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
