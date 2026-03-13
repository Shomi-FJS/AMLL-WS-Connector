import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import type { BaseLyricAdapter } from "@/adapters/BaseLyricAdapter";
import { TtmlLyricAdapter } from "@/adapters/ttml/TtmlLyricAdapter";
import { V2LyricAdapter } from "@/adapters/v2";
import { V3LyricAdapter } from "@/adapters/v3";
import { LyricManager } from "@/core/LyricManager";
import { lyricAtom, songInfoAtom } from "@/store";
import type { AmllLyricContent } from "@/types/ws";

export function LyricSync() {
	const setLyric = useSetAtom(lyricAtom);
	const songInfo = useAtomValue(songInfoAtom);
	const managerRef = useRef<LyricManager | null>(null);

	useEffect(() => {
		let ncmAdapter: BaseLyricAdapter;

		// 网易云音乐 v2 客户端特有的 NEJ 框架全局对象
		if (window.NEJ) {
			ncmAdapter = new V2LyricAdapter();
		} else {
			ncmAdapter = new V3LyricAdapter();
		}

		const ttmlAdapter = new TtmlLyricAdapter();

		const manager = new LyricManager(ncmAdapter, ttmlAdapter);
		managerRef.current = manager;

		const handleLyricUpdate = (event: CustomEvent<AmllLyricContent | null>) => {
			setLyric(event.detail);
		};

		manager.addEventListener("update", handleLyricUpdate);

		manager.init().then((success) => {
			if (!success) {
				console.error("[LyricSync] 歌词适配器初始化失败");
			}
		});

		return () => {
			if (managerRef.current) {
				managerRef.current.removeEventListener("update", handleLyricUpdate);
				managerRef.current.destroy();
				managerRef.current = null;
			}
		};
	}, [setLyric]);

	useEffect(() => {
		if (songInfo?.ncmId && managerRef.current) {
			managerRef.current.fetchLyric(songInfo.ncmId);
		}
	}, [songInfo?.ncmId]);

	return null;
}
