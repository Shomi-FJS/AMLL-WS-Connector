/**
 * @fileoverview 调试信息对话框
 *
 * 展示当前各歌曲状态的数据
 */

import {
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Stack,
	Typography,
} from "@mui/material";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import {
	playbackStatusAtom,
	playModeAtom,
	songInfoAtom,
	timelineInfoAtom,
	volumeInfoAtom,
} from "@/utils/atoms";

function DebugSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<Box>
			<Typography
				variant="caption"
				sx={{
					fontWeight: 600,
					textTransform: "uppercase",
					letterSpacing: 0.8,
					color: "text.secondary",
				}}
			>
				{title}
			</Typography>
			<Box
				sx={{
					mt: 0.5,
					borderRadius: 1,
					border: "1px solid",
					borderColor: "divider",
					overflow: "hidden",
				}}
			>
				{children}
			</Box>
		</Box>
	);
}

function DebugRow({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: ReactNode;
	mono?: boolean;
}) {
	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "center",
				px: 1.5,
				py: 0.75,
				"&:not(:last-child)": {
					borderBottom: "1px solid",
					borderColor: "divider",
				},
				backgroundColor: (theme) =>
					theme.palette.mode === "dark"
						? "rgba(255,255,255,0.03)"
						: "rgba(0,0,0,0.02)",
			}}
		>
			<Typography
				variant="body2"
				sx={{ flex: "0 0 140px", color: "text.secondary", fontSize: "0.8rem" }}
			>
				{label}
			</Typography>
			<Typography
				variant="body2"
				sx={{
					flex: 1,
					fontSize: "0.8rem",
					fontFamily: mono
						? '"Fira Code", "Cascadia Code", Consolas, monospace'
						: undefined,
					wordBreak: "break-all",
				}}
			>
				{value ?? <span style={{ opacity: 0.4 }}>null</span>}
			</Typography>
		</Box>
	);
}

function formatMs(ms: number | undefined) {
	if (ms === undefined) return "—";
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	return `${m}:${String(s % 60).padStart(2, "0")} (${ms} ms)`;
}

export function DebugDialog({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const songInfo = useAtomValue(songInfoAtom);
	const playbackStatus = useAtomValue(playbackStatusAtom);
	const timelineInfo = useAtomValue(timelineInfoAtom);
	const playMode = useAtomValue(playModeAtom);
	const volumeInfo = useAtomValue(volumeInfoAtom);

	return (
		<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
			<DialogTitle>调试面板</DialogTitle>
			<DialogContent dividers>
				<Stack spacing={2}>
					<DebugSection title="歌曲信息">
						<DebugRow label="歌曲名称" value={songInfo?.songName} />
						<DebugRow label="专辑名称" value={songInfo?.albumName} />
						<DebugRow label="艺术家" value={songInfo?.authorName} />
						<DebugRow label="歌曲 ID" value={songInfo?.ncmId} mono />
						<DebugRow
							label="总时长"
							value={formatMs(songInfo?.duration)}
							mono
						/>
					</DebugSection>

					<DebugSection title="播放状态">
						<DebugRow label="播放 / 暂停" value={playbackStatus} mono />
					</DebugSection>

					<DebugSection title="播放进度">
						<DebugRow
							label="当前时间"
							value={formatMs(timelineInfo?.currentTime)}
							mono
						/>
						<DebugRow
							label="总时长"
							value={formatMs(timelineInfo?.totalTime)}
							mono
						/>
					</DebugSection>

					<DebugSection title="播放模式">
						<DebugRow
							label="随机播放"
							value={
								playMode == null ? null : playMode.isShuffling ? "开启" : "关闭"
							}
						/>
						<DebugRow label="循环模式" value={playMode?.repeatMode} mono />
					</DebugSection>

					<DebugSection title="音量">
						<DebugRow
							label="音量"
							value={
								volumeInfo == null
									? null
									: `${Math.round(volumeInfo.volume * 100)}%`
							}
							mono
						/>
						<DebugRow
							label="静音"
							value={
								volumeInfo == null ? null : volumeInfo.isMuted ? "是" : "否"
							}
						/>
					</DebugSection>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>关闭</Button>
			</DialogActions>
		</Dialog>
	);
}
