import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { ExternalLyricAdapter } from "@/adapters/ExternalLyricAdapter";
import { V2LyricAdapter } from "@/adapters/v2";
import { V3LyricAdapter } from "@/adapters/v3";
import { LyricManager } from "@/core/LyricManager";
import {
	type LyricSearchStatus,
	lyricAtom,
	lyricSearchStatusAtom,
	lyricSourcesConfigAtom,
	type PluginLyricState,
	type RawLyricData,
	rawLyricsContentAtom,
	songInfoAtom,
} from "@/store";
import type { SongInfo } from "@/types/inflink";

export function LyricSync() {
	const setLyric = useSetAtom(lyricAtom);
	const setSearchStatuses = useSetAtom(lyricSearchStatusAtom);
	const setRawLyricsContent = useSetAtom(rawLyricsContentAtom);

	const songInfo = useAtomValue(songInfoAtom);
	const songInfoRef = useRef(songInfo);
	const sourcesConfig = useAtomValue(lyricSourcesConfigAtom);

	const managerRef = useRef<LyricManager | null>(null);
	const isManagerReadyRef = useRef(false);
	const managerInitTokenRef = useRef(0);
	// 上一次请求歌词的歌曲 ID，避免重复请求
	const lastRequestedSongIdRef = useRef<SongInfo["ncmId"] | null>(null);

	const fetchLyricIfNeeded = useCallback(
		(targetSong: SongInfo, force = false) => {
			if (!managerRef.current || !isManagerReadyRef.current) {
				return;
			}

			if (!force && lastRequestedSongIdRef.current === targetSong.ncmId) {
				return;
			}

			lastRequestedSongIdRef.current = targetSong.ncmId;
			managerRef.current.fetchLyric(targetSong);
		},
		[],
	);

	// 同步 songInfo 到 ref，供异步回调中使用最新值
	useEffect(() => {
		songInfoRef.current = songInfo;
	}, [songInfo]);

	// LyricManager 生命周期管理：挂载时创建，卸载时销毁
	useEffect(() => {
		const manager = new LyricManager();
		managerRef.current = manager;
		isManagerReadyRef.current = false;
		lastRequestedSongIdRef.current = null;

		const handleLyricUpdate = (event: CustomEvent<PluginLyricState | null>) =>
			setLyric(event.detail);

		const handleStatusChange = (
			event: CustomEvent<Record<string, LyricSearchStatus>>,
		) => setSearchStatuses(event.detail);

		const handleRawLyricChange = (
			event: CustomEvent<Record<string, RawLyricData | null>>,
		) => setRawLyricsContent(event.detail);

		manager.addEventListener("update", handleLyricUpdate);
		manager.addEventListener("statuschange", handleStatusChange);
		manager.addEventListener("rawlyricchange", handleRawLyricChange);

		return () => {
			managerInitTokenRef.current += 1;
			isManagerReadyRef.current = false;
			lastRequestedSongIdRef.current = null;
			manager.removeEventListener("update", handleLyricUpdate);
			manager.removeEventListener("statuschange", handleStatusChange);
			manager.removeEventListener("rawlyricchange", handleRawLyricChange);
			manager.destroy();
			if (managerRef.current === manager) {
				managerRef.current = null;
			}
		};
	}, [setLyric, setSearchStatuses, setRawLyricsContent]);

	// 歌词源配置变化时，重建适配器并重新初始化
	useEffect(() => {
		const manager = managerRef.current;
		if (!manager) return;

		const enabledSources = sourcesConfig.filter((item) => item.enabled);

		const newAdapters = enabledSources.map((config) => {
			if (config.source.type === "builtin:ncm") {
				// 网易云音乐 v2 客户端特有的 NEJ 框架全局对象
				// 只有检测到它存在才走 v2 适配器，否则降级到 v3。
				if (window.NEJ) {
					return new V2LyricAdapter();
				}
				return new V3LyricAdapter();
			}

			return new ExternalLyricAdapter(config.source);
		});

		isManagerReadyRef.current = false;
		lastRequestedSongIdRef.current = null;
		const initToken = managerInitTokenRef.current + 1;
		managerInitTokenRef.current = initToken;

		manager.setAdapters(newAdapters);

		manager.init().then(() => {
			if (
				managerRef.current !== manager ||
				managerInitTokenRef.current !== initToken
			) {
				return;
			}

			isManagerReadyRef.current = true;
			const currentSong = songInfoRef.current;
			if (currentSong?.ncmId) {
				fetchLyricIfNeeded(currentSong, true);
			}
		});
	}, [fetchLyricIfNeeded, sourcesConfig]);

	// 歌曲信息变化时，请求对应歌词
	useEffect(() => {
		if (songInfo?.ncmId) {
			fetchLyricIfNeeded(songInfo);
		}
	}, [fetchLyricIfNeeded, songInfo]);

	return null;
}
