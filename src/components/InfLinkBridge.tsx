/**
 * @fileoverview
 * 与 InfLink-rs 插件的桥接组件
 */

import { useSetAtom } from "jotai";
import { useEffect } from "react";
import type {
	AudioDataInfo,
	PlaybackStatus,
	PlayMode,
	SongInfo,
	TimelineInfo,
	VolumeInfo,
} from "../types/inflink";
import {
	infLinkReadyAtom,
	playbackStatusAtom,
	playModeAtom,
	songInfoAtom,
	timelineInfoAtom,
	volumeInfoAtom,
} from "../utils/atoms";

/**
 * 音频数据总线。
 * 分发 "audiodata" 事件，事件的 detail 为 AudioDataInfo。
 * 消费方直接调用 AudioDataBus.addEventListener("audiodata", handler) 订阅。
 */
export const AudioDataBus = new EventTarget();

export function InfLinkBridge() {
	const setSongInfo = useSetAtom(songInfoAtom);
	const setPlaybackStatus = useSetAtom(playbackStatusAtom);
	const setTimelineInfo = useSetAtom(timelineInfoAtom);
	const setPlayMode = useSetAtom(playModeAtom);
	const setVolumeInfo = useSetAtom(volumeInfoAtom);
	const setReady = useSetAtom(infLinkReadyAtom);

	useEffect(() => {
		let api = window.InfLinkApi;
		let pollTimer: ReturnType<typeof setInterval> | null = null;

		function attach(resolvedApi: NonNullable<typeof api>) {
			setSongInfo(resolvedApi.getCurrentSong());
			setPlaybackStatus(resolvedApi.getPlaybackStatus());
			setTimelineInfo(resolvedApi.getTimeline());
			setPlayMode(resolvedApi.getPlayMode());
			setVolumeInfo(resolvedApi.getVolume());
			setReady(true);

			const onSongChange = (e: CustomEvent<SongInfo>) => setSongInfo(e.detail);
			const onPlayStateChange = (e: CustomEvent<PlaybackStatus>) =>
				setPlaybackStatus(e.detail);
			const onTimelineUpdate = (e: CustomEvent<TimelineInfo>) =>
				setTimelineInfo(e.detail);
			const onPlayModeChange = (e: CustomEvent<PlayMode>) =>
				setPlayMode(e.detail);
			const onVolumeChange = (e: CustomEvent<VolumeInfo>) =>
				setVolumeInfo(e.detail);

			const onAudioData = (e: CustomEvent<AudioDataInfo>) => {
				AudioDataBus.dispatchEvent(
					new CustomEvent("audiodata", { detail: e.detail }),
				);
			};

			resolvedApi.addEventListener("songChange", onSongChange);
			resolvedApi.addEventListener("playStateChange", onPlayStateChange);
			resolvedApi.addEventListener("rawTimelineUpdate", onTimelineUpdate);
			resolvedApi.addEventListener("playModeChange", onPlayModeChange);
			resolvedApi.addEventListener("volumeChange", onVolumeChange);
			resolvedApi.addEventListener("audioDataUpdate", onAudioData);

			return () => {
				resolvedApi.removeEventListener("songChange", onSongChange);
				resolvedApi.removeEventListener("playStateChange", onPlayStateChange);
				resolvedApi.removeEventListener("rawTimelineUpdate", onTimelineUpdate);
				resolvedApi.removeEventListener("playModeChange", onPlayModeChange);
				resolvedApi.removeEventListener("volumeChange", onVolumeChange);
				resolvedApi.removeEventListener("audioDataUpdate", onAudioData);
				setReady(false);
			};
		}

		let cleanup: (() => void) | undefined;

		if (api) {
			cleanup = attach(api);
		} else {
			pollTimer = setInterval(() => {
				api = window.InfLinkApi;
				if (api) {
					const t = pollTimer;
					pollTimer = null;
					if (t !== null) clearInterval(t);
					cleanup = attach(api);
				}
			}, 500);
		}

		return () => {
			if (pollTimer !== null) clearInterval(pollTimer);
			cleanup?.();
		};
	}, [
		setSongInfo,
		setPlaybackStatus,
		setTimelineInfo,
		setPlayMode,
		setVolumeInfo,
		setReady,
	]);

	return null;
}
