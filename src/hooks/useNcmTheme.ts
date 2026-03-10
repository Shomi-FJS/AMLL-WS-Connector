import type { PaletteMode } from "@mui/material";
import { useEffect, useState } from "react";

function getNcmThemeMode(): PaletteMode {
	const v3Theme = localStorage.getItem("currentTheme");
	if (v3Theme) {
		return /^dark/i.test(v3Theme) ? "dark" : "light";
	}

	const v2Theme = localStorage.getItem("NM_SETTING_SKIN");
	if (v2Theme) {
		try {
			const v2ThemeConfig = JSON.parse(v2Theme);
			const selectedTheme = v2ThemeConfig?.selected?.name;
			return selectedTheme === "default" ? "dark" : "light";
		} catch {
			// 解析失败时回退到亮色
		}
	}

	return "light";
}

/**
 * 监听网易云音乐的主题变化并返回当前 palette mode。
 *
 * 由于本插件依赖 InfLink-rs，InfLink-rs 已对 localStorage.setItem 进行
 * 了猴子补丁使其能在同一页面触发 storage 事件，因此这里直接监听即可，
 * 无需重复打补丁。
 */
export function useNcmTheme(): PaletteMode {
	const [mode, setMode] = useState<PaletteMode>(getNcmThemeMode);

	useEffect(() => {
		const handleStorageChange = (event: StorageEvent) => {
			if (event.key === "currentTheme" || event.key === "NM_SETTING_SKIN") {
				setMode(getNcmThemeMode());
			}
		};

		window.addEventListener("storage", handleStorageChange);
		return () => {
			window.removeEventListener("storage", handleStorageChange);
		};
	}, []);

	return mode;
}
