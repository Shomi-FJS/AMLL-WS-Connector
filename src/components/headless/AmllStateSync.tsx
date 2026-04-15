/**
 * @fileoverview
 * 将歌曲信息同步给 AMLL Player，同时处理 AMLL Player 的控制指令
 *
 * 元数据过滤和 NFKC 规范化在此组件的发送阶段统一处理，
 * 而非在歌词解析阶段，确保用户切换开关后立即生效，无需重新获取歌词。
 */

import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { filterStructuredLyricLines } from "@/core/parsers/metadata";
import { useWsConnectionManager } from "@/hooks/useWsConnectionManager";
import {
	autoConnectAtom,
	connectionIntentAtom,
	connectionStatusAtom,
	filterMetadataAtom,
	lyricAtom,
	nextAtom,
	nfkcNormalizeAtom,
	pauseAtom,
	playAtom,
	playbackStatusAtom,
	playModeAtom,
	previousAtom,
	reconnectCountdownAtom,
	seekToAtom,
	setRepeatModeAtom,
	setShuffleModeAtom,
	setVolumeAtom,
	songInfoAtom,
	timelineInfoAtom,
	timelineOffsetAtom,
	volumeInfoAtom,
} from "@/store";
import type {
	AudioDataInfo,
	RepeatMode as NCMRepeatMode,
} from "@/types/inflink";
import type {
	AmllLyricContent,
	AmllMessage,
	AmllRepeatMode,
	AmllStateUpdate,
} from "@/types/ws";
import { CoverManager } from "@/utils/cover";
import {
	BinaryMagicNumber,
	createAmllBinaryPayload,
} from "@/utils/createAmllBinaryPayload";
import { AudioDataBus } from "./InfLinkBridge";

/**
 * 发送前的歌词处理管线：元数据过滤 → NFKC 规范化
 * 在发送阶段而非解析阶段处理，使得 filterMetadata / nfkcNormalize 开关
 * 变化时只需重新发送，无需重新获取和解析歌词。
 */
function processLyricContent(
	content: AmllLyricContent,
	filterMeta: boolean,
	nfkc: boolean,
): AmllLyricContent {
	if (content.format === "ttml") {
		return content;
	}

	let lines = content.lines;

	if (filterMeta) {
		lines = filterStructuredLyricLines(lines);
	}

	if (nfkc) {
		lines = lines.map((line) => ({
			...line,
			words: line.words.map((word) => ({
				...word,
				word: word.word.normalize("NFKC"),
				romanWord: word.romanWord?.normalize("NFKC"),
			})),
			translatedLyric: line.translatedLyric?.normalize("NFKC"),
			romanLyric: line.romanLyric?.normalize("NFKC"),
		}));
	}

	return { format: "structured", lines };
}

export function AmllStateSync() {
	const status = useAtomValue(connectionStatusAtom);
	const autoConnect = useAtomValue(autoConnectAtom);
	const setIntent = useSetAtom(connectionIntentAtom);
	const isInitializedRef = useRef(false);

	const coverManagerRef = useRef(new CoverManager());

	const songInfo = useAtomValue(songInfoAtom);
	const playbackStatus = useAtomValue(playbackStatusAtom);
	const timelineInfo = useAtomValue(timelineInfoAtom);
	const playMode = useAtomValue(playModeAtom);
	const volumeInfo = useAtomValue(volumeInfoAtom);
	const timelineOffset = useAtomValue(timelineOffsetAtom);

	const lyricContent = useAtomValue(lyricAtom);
	const nfkcNormalize = useAtomValue(nfkcNormalizeAtom);
	const filterMetadata = useAtomValue(filterMetadataAtom);

	const play = useSetAtom(playAtom);
	const pause = useSetAtom(pauseAtom);
	const next = useSetAtom(nextAtom);
	const previous = useSetAtom(previousAtom);
	const setVolume = useSetAtom(setVolumeAtom);
	const seekTo = useSetAtom(seekToAtom);
	const setRepeatMode = useSetAtom(setRepeatModeAtom);
	const setShuffleMode = useSetAtom(setShuffleModeAtom);

	const setReconnectCountdown = useSetAtom(reconnectCountdownAtom);

	const handleIncomingMessage = useCallback(
		(event: MessageEvent) => {
			if (typeof event.data !== "string") return;

			try {
				const message: AmllMessage = JSON.parse(event.data);

				if (message.type === "command") {
					const cmd = message.value;

					switch (cmd.command) {
						case "pause":
							pause();
							break;
						case "resume":
							play();
							break;
						case "forwardSong":
							next();
							break;
						case "backwardSong":
							previous();
							break;
						case "setVolume":
							setVolume(cmd.volume);
							break;
						case "seekPlayProgress":
							seekTo(cmd.progress);
							break;
						case "setRepeatMode": {
							const modeMap: Record<AmllRepeatMode, NCMRepeatMode> = {
								off: "None",
								all: "List",
								one: "Track",
							};
							setRepeatMode(modeMap[cmd.mode]);
							break;
						}
						case "setShuffleMode":
							setShuffleMode(cmd.enabled);
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
		},
		[
			play,
			pause,
			next,
			previous,
			setVolume,
			seekTo,
			setRepeatMode,
			setShuffleMode,
		],
	);

	useEffect(() => {
		if (!isInitializedRef.current) {
			setIntent(autoConnect);
			isInitializedRef.current = true;
		}
	}, [autoConnect, setIntent]);

	const { send, countdown } = useWsConnectionManager({
		onMessage: handleIncomingMessage,
		onConnected: () => {
			send(JSON.stringify({ type: "initialize" }));
		},
	});

	useEffect(() => {
		setReconnectCountdown(countdown);
	}, [countdown, setReconnectCountdown]);

	const sendStateUpdate = useCallback(
		(updateObj: AmllStateUpdate) => {
			send(JSON.stringify({ type: "state", value: updateObj }));
		},
		[send],
	);

	useEffect(() => {
		if (!songInfo || status !== "connected") return;

		sendStateUpdate({
			update: "setMusic",
			musicId: songInfo.ncmId.toString(),
			musicName: songInfo.songName,
			albumId: "",
			albumName: songInfo.albumName,
			artists: [{ id: "", name: songInfo.authorName }],
			duration: songInfo.duration ?? 0,
		});

		if (songInfo.cover?.url) {
			const fetchAndSendCover = async () => {
				try {
					const { cover } = await coverManagerRef.current.getCover(
						songInfo,
						"500",
					);

					if (cover?.blob) {
						const arrayBuffer = await cover.blob.arrayBuffer();

						const buffer = createAmllBinaryPayload(
							BinaryMagicNumber.SetCoverData,
							arrayBuffer,
						);

						send(buffer);
					}
				} catch (e) {
					if ((e as Error).name !== "AbortError") {
						console.error("获取或发送缓存封面失败", e);
						sendStateUpdate({
							update: "setCover",
							source: "uri",
							url: songInfo.cover?.url || "",
						});
					}
				}
			};

			fetchAndSendCover();
		}
	}, [songInfo, status, send, sendStateUpdate]);

	useEffect(() => {
		if (!playbackStatus || status !== "connected") return;
		sendStateUpdate({
			update: playbackStatus === "Playing" ? "resumed" : "paused",
		});
	}, [playbackStatus, status, sendStateUpdate]);

	useEffect(() => {
		if (!timelineInfo || status !== "connected") return;

		const adjustedProgress = Math.max(
			0,
			timelineInfo.currentTime - timelineOffset,
		);

		sendStateUpdate({
			update: "progress",
			progress: Math.floor(adjustedProgress),
		});
	}, [timelineInfo, timelineOffset, status, sendStateUpdate]);

	useEffect(() => {
		if (!volumeInfo || status !== "connected") return;
		sendStateUpdate({
			update: "volume",
			volume: volumeInfo.isMuted ? 0 : volumeInfo.volume,
		});
	}, [volumeInfo, status, sendStateUpdate]);

	useEffect(() => {
		if (!playMode || status !== "connected") return;
		const repeatMap: Record<NCMRepeatMode, AmllRepeatMode> = {
			None: "off",
			Track: "one",
			List: "all",
			AI: "all",
		};
		sendStateUpdate({
			update: "modeChanged",
			repeat: repeatMap[playMode.repeatMode] || "off",
			shuffle: playMode.isShuffling,
		});
	}, [playMode, status, sendStateUpdate]);

	// 歌词内容、过滤开关或规范化开关变化时，重新处理并发送
	useEffect(() => {
		if (!lyricContent || status !== "connected") return;

		const processedPayload = processLyricContent(
			lyricContent.payload,
			filterMetadata,
			nfkcNormalize,
		);

		sendStateUpdate({
			update: "setLyric",
			...processedPayload,
		});
	}, [lyricContent, filterMetadata, nfkcNormalize, status, sendStateUpdate]);

	useEffect(() => {
		const handleAudioData = (e: Event) => {
			if (status !== "connected") return;

			const { data } = (e as CustomEvent<AudioDataInfo>).detail;

			const buffer = createAmllBinaryPayload(BinaryMagicNumber.AudioData, data);

			send(buffer);
		};

		AudioDataBus.addEventListener("audiodata", handleAudioData);
		return () => {
			AudioDataBus.removeEventListener("audiodata", handleAudioData);
		};
	}, [send, status]);

	return null;
}
