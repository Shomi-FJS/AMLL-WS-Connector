/**
 * @fileoverview
 * 将歌曲信息通过 Websocket 同步给 AMLL Player，同时处理 AMLL Player 的控制指令
 */

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import {
	autoConnectAtom,
	connectionErrorAtom,
	connectionStatusAtom,
	playbackStatusAtom,
	playModeAtom,
	songInfoAtom,
	timelineInfoAtom,
	volumeInfoAtom,
	wsUrlAtom,
} from "@/store";
import type {
	AudioDataInfo,
	RepeatMode as NCMRepeatMode,
} from "@/types/inflink";
import type { AmllMessage, AmllRepeatMode, AmllStateUpdate } from "@/types/ws";
import { AudioDataBus } from "./InfLinkBridge";

export function AmllWsClient() {
	const wsRef = useRef<WebSocket | null>(null);
	const hasAutoConnected = useRef(false);

	const wsUrl = useAtomValue(wsUrlAtom);
	const autoConnect = useAtomValue(autoConnectAtom);
	const [status, setStatus] = useAtom(connectionStatusAtom);
	const setError = useSetAtom(connectionErrorAtom);

	const songInfo = useAtomValue(songInfoAtom);
	const playbackStatus = useAtomValue(playbackStatusAtom);
	const timelineInfo = useAtomValue(timelineInfoAtom);
	const playMode = useAtomValue(playModeAtom);
	const volumeInfo = useAtomValue(volumeInfoAtom);

	useEffect(() => {
		if (!hasAutoConnected.current && autoConnect && status === "disconnected") {
			hasAutoConnected.current = true;
			setStatus("connecting");
		}
	}, [autoConnect, status, setStatus]);

	const sendWs = useCallback((updateObj: AmllStateUpdate) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({ type: "state", value: updateObj }));
		}
	}, []);

	useEffect(() => {
		if (status === "connecting" && !wsRef.current) {
			const ws = new WebSocket(wsUrl);
			wsRef.current = ws;

			ws.onopen = () => {
				setStatus("connected");
				ws.send(JSON.stringify({ type: "initialize" }));
			};

			ws.onmessage = (event) => {
				if (typeof event.data !== "string") return;

				try {
					const message: AmllMessage = JSON.parse(event.data);

					if (message.type === "command") {
						const cmd = message.value;
						const api = window.InfLinkApi;

						if (!api) return;

						switch (cmd.command) {
							case "pause":
								api.pause();
								break;
							case "resume":
								api.play();
								break;
							case "forwardSong":
								api.next();
								break;
							case "backwardSong":
								api.previous();
								break;
							case "setVolume":
								api.setVolume(cmd.volume);
								break;
							case "seekPlayProgress":
								api.seekTo(cmd.progress);
								break;
							case "setRepeatMode": {
								const modeMap: Record<AmllRepeatMode, NCMRepeatMode> = {
									off: "None",
									all: "List",
									one: "Track",
								};
								api.setRepeatMode(modeMap[cmd.mode]);
								break;
							}
							case "setShuffleMode":
								if (api.getPlayMode().isShuffling !== cmd.enabled) {
									api.toggleShuffle();
								}
								break;
							default: {
								const exhaustiveCheck: never = cmd;
								console.warn("未处理的控制指令", exhaustiveCheck);
							}
						}
					}
				} catch (err) {
					console.error("解析 AMLL WebSocket 消息失败:", err);
				}
			};

			ws.onclose = () => {
				if (wsRef.current === ws) {
					setStatus("disconnected");
					wsRef.current = null;
				}
			};

			ws.onerror = () => {
				if (wsRef.current === ws) {
					setStatus("error");
					setError("无法连接到 AMLL 服务器，请检查地址是否正确");
					wsRef.current = null;
				}
			};
		} else if (status === "disconnected" && wsRef.current) {
			wsRef.current.close();
			wsRef.current = null;
		}
	}, [status, wsUrl, setStatus, setError]);

	useEffect(() => {
		return () => {
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (!songInfo || status !== "connected") return;

		sendWs({
			update: "setMusic",
			musicId: songInfo.ncmId.toString(),
			musicName: songInfo.songName,
			albumId: "",
			albumName: songInfo.albumName,
			artists: [{ id: "", name: songInfo.authorName }],
			duration: songInfo.duration ?? 0,
		});

		if (songInfo.cover?.url) {
			sendWs({
				update: "setCover",
				source: "uri",
				url: songInfo.cover.url,
			});
		}
	}, [songInfo, status, sendWs]);

	useEffect(() => {
		if (!playbackStatus || status !== "connected") return;
		sendWs({
			update: playbackStatus === "Playing" ? "resumed" : "paused",
		});
	}, [playbackStatus, status, sendWs]);

	useEffect(() => {
		if (!timelineInfo || status !== "connected") return;
		sendWs({
			update: "progress",
			progress: Math.floor(timelineInfo.currentTime),
		});
	}, [timelineInfo, status, sendWs]);

	useEffect(() => {
		if (!volumeInfo || status !== "connected") return;
		sendWs({
			update: "volume",
			volume: volumeInfo.isMuted ? 0 : volumeInfo.volume,
		});
	}, [volumeInfo, status, sendWs]);

	useEffect(() => {
		if (!playMode || status !== "connected") return;
		const repeatMap: Record<NCMRepeatMode, AmllRepeatMode> = {
			None: "off",
			Track: "one",
			List: "all",
			AI: "all",
		};
		sendWs({
			update: "modeChanged",
			repeat: repeatMap[playMode.repeatMode] || "off",
			shuffle: playMode.isShuffling,
		});
	}, [playMode, status, sendWs]);

	useEffect(() => {
		const handleAudioData = (e: Event) => {
			const ws = wsRef.current;
			if (ws?.readyState !== WebSocket.OPEN) return;

			const { data } = (e as CustomEvent<AudioDataInfo>).detail;

			const buffer = new ArrayBuffer(6 + data.byteLength);
			const view = new DataView(buffer);
			view.setUint16(0, 0, true);
			view.setUint32(2, data.byteLength, true);
			new Uint8Array(buffer, 6).set(new Uint8Array(data));

			ws.send(buffer);
		};

		AudioDataBus.addEventListener("audiodata", handleAudioData);
		return () => {
			AudioDataBus.removeEventListener("audiodata", handleAudioData);
		};
	}, []);

	return null;
}
