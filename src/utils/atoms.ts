/**
 * @fileoverview
 * 插件的全局状态定义
 */

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

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
