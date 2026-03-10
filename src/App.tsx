/**
 * @fileoverview
 * 插件设置界面根组件
 */

import LinkIcon from "@mui/icons-material/Link";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import WifiIcon from "@mui/icons-material/Wifi";
import {
	Box,
	Button,
	Chip,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { SettingItem } from "./components/SettingItem";
import { useNcmTheme } from "./hooks/useNcmTheme";
import {
	autoConnectAtom,
	type ConnectionStatus,
	connectionErrorAtom,
	connectionStatusAtom,
	wsUrlAtom,
} from "./utils/atoms";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
	connected: "已连接",
	connecting: "连接中...",
	disconnected: "未连接",
	error: "连接错误",
};

const STATUS_COLOR: Record<
	ConnectionStatus,
	"success" | "warning" | "default" | "error"
> = {
	connected: "success",
	connecting: "warning",
	disconnected: "default",
	error: "error",
};

export default function App() {
	const ncmThemeMode = useNcmTheme();

	const theme = useMemo(
		() =>
			createTheme({
				palette: {
					mode: ncmThemeMode,
				},
				typography: {
					fontFamily: [
						'"Noto Sans SC"',
						'"Microsoft YaHei"',
						'"Segoe UI"',
						"Roboto",
						'"Helvetica Neue"',
						"Arial",
						"sans-serif",
					].join(","),
				},
			}),
		[ncmThemeMode],
	);

	return (
		<ThemeProvider theme={theme}>
			<Main />
		</ThemeProvider>
	);
}

function Main() {
	const [wsUrl, setWsUrl] = useAtom(wsUrlAtom);
	const [autoConnect, setAutoConnect] = useAtom(autoConnectAtom);
	const [status, setStatus] = useAtom(connectionStatusAtom);
	const [, setError] = useAtom(connectionErrorAtom);

	const isConnected = status === "connected";
	const isConnecting = status === "connecting";

	function handleToggleConnection() {
		if (isConnected || isConnecting) {
			setStatus("disconnected");
			setError("");
		} else {
			setStatus("connecting");
			setError("");
			const ws = new WebSocket(wsUrl);
			ws.onopen = () => setStatus("connected");
			ws.onerror = () => {
				setStatus("error");
				setError("无法连接到服务器，请检查地址是否正确");
			};
			ws.onclose = () => {
				if (status !== "error") setStatus("disconnected");
			};
		}
	}

	return (
		<Box sx={{ pb: 4, pt: 1 }}>
			<Typography variant="h5" sx={{ mb: 3, fontWeight: "bold" }}>
				AMLL WS Connector 设置
			</Typography>

			<SettingItem
				icon={<WifiIcon />}
				title="连接状态"
				description="当前与 AMLL Player 的 WebSocket 连接状态"
				action={
					<Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
						<Chip
							label={STATUS_LABEL[status]}
							color={STATUS_COLOR[status]}
							size="small"
						/>
						<Button
							variant="outlined"
							size="small"
							color={isConnected || isConnecting ? "error" : "primary"}
							disabled={isConnecting}
							onClick={handleToggleConnection}
						>
							{isConnected || isConnecting ? "断开" : "连接"}
						</Button>
					</Box>
				}
			/>

			<SettingItem
				icon={<LinkIcon />}
				title="WebSocket 服务器地址"
				description="AMLL Player 监听的 WebSocket 服务器地址"
				action={
					<TextField
						size="small"
						value={wsUrl}
						onChange={(e) => setWsUrl(e.target.value)}
						placeholder="ws://localhost:11444"
						disabled={isConnected || isConnecting}
						sx={{ width: 220 }}
					/>
				}
			/>

			<SettingItem
				icon={<PowerSettingsNewIcon />}
				title="自动连接"
				description="插件加载时自动连接到配置的 WebSocket 服务器"
				action={
					<Switch
						checked={autoConnect}
						onChange={(_, checked) => setAutoConnect(checked)}
					/>
				}
			/>
		</Box>
	);
}
