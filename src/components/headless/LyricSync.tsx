import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
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

export function LyricSync() {
	const setLyric = useSetAtom(lyricAtom);
	const setSearchStatuses = useSetAtom(lyricSearchStatusAtom);
	const setRawLyricsContent = useSetAtom(rawLyricsContentAtom);

	const songInfo = useAtomValue(songInfoAtom);
	const songInfoRef = useRef(songInfo);
	const sourcesConfig = useAtomValue(lyricSourcesConfigAtom);

	const managerRef = useRef<LyricManager | null>(null);

	useEffect(() => {
		songInfoRef.current = songInfo;
	}, [songInfo]);

	useEffect(() => {
		managerRef.current = new LyricManager();

		const handleLyricUpdate = (event: CustomEvent<PluginLyricState | null>) =>
			setLyric(event.detail);

		const handleStatusChange = (
			event: CustomEvent<Record<string, LyricSearchStatus>>,
		) => setSearchStatuses(event.detail);

		const handleRawLyricChange = (
			event: CustomEvent<Record<string, RawLyricData | null>>,
		) => setRawLyricsContent(event.detail);

		managerRef.current.addEventListener("update", handleLyricUpdate);
		managerRef.current.addEventListener("statuschange", handleStatusChange);
		managerRef.current.addEventListener("rawlyricchange", handleRawLyricChange);

		return () => {
			managerRef.current?.removeEventListener("update", handleLyricUpdate);
			managerRef.current?.removeEventListener(
				"statuschange",
				handleStatusChange,
			);
			managerRef.current?.removeEventListener(
				"rawlyricchange",
				handleRawLyricChange,
			);
			managerRef.current?.destroy();
		};
	}, [setLyric, setSearchStatuses, setRawLyricsContent]);

	useEffect(() => {
		if (!managerRef.current) return;

		const enabledSources = sourcesConfig.filter((item) => item.enabled);

		const newAdapters = enabledSources.map((config) => {
			if (config.source.type === "builtin:ncm") {
				// 网易云音乐 v2 客户端特有的 NEJ 框架全局对象
				if (window.NEJ) {
					return new V2LyricAdapter();
				} else {
					return new V3LyricAdapter();
				}
			} else {
				return new ExternalLyricAdapter(config.source);
			}
		});

		managerRef.current.setAdapters(newAdapters);

		managerRef.current.init().then(() => {
			const currentSong = songInfoRef.current;
			if (currentSong?.ncmId) {
				managerRef.current?.fetchLyric(currentSong);
			}
		});
	}, [sourcesConfig]);

	useEffect(() => {
		if (songInfo?.ncmId && managerRef.current) {
			managerRef.current.fetchLyric(songInfo);
		}
	}, [songInfo]);

	return null;
}
