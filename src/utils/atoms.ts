/**
 * @fileoverview
 * 插件的全局状态定义
 */

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type {
	PlaybackStatus,
	PlayMode,
	SongInfo,
	TimelineInfo,
	VolumeInfo,
} from "@/types/inflink";

/** WebSocket 服务器地址 */
export const wsUrlAtom = atomWithStorage(
	"amll-ws-connector:wsUrl",
	"ws://localhost:11444",
);

/** 是否在插件加载时自动连接 */
export const autoConnectAtom = atomWithStorage(
	"amll-ws-connector:autoConnect",
	false,
);

/** WebSocket 连接状态 */
export type ConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error";

export const connectionStatusAtom = atom<ConnectionStatus>("disconnected");

/** 最近一次连接错误信息 */
export const connectionErrorAtom = atom<string>("");

/** InfLink-rs API 是否已就绪 */
export const infLinkReadyAtom = atom<boolean>(false);

/** 当前歌曲信息 */
export const songInfoAtom = atom<SongInfo | null>(null);

/** 当前播放状态 */
export const playbackStatusAtom = atom<PlaybackStatus | null>(null);

/** 当前播放进度 */
export const timelineInfoAtom = atom<TimelineInfo | null>(null);

/** 当前播放模式 */
export const playModeAtom = atom<PlayMode | null>(null);

/** 当前音量信息 */
export const volumeInfoAtom = atom<VolumeInfo | null>(null);
