import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import type { BaseLyricAdapter } from "@/adapters/BaseLyricAdapter";
import { ExternalLyricAdapter } from "@/adapters/ExternalLyricAdapter";
import { V2LyricAdapter } from "@/adapters/v2";
import { V3LyricAdapter } from "@/adapters/v3";
import { LyricManager } from "@/core/LyricManager";
import { lyricAtom, songInfoAtom } from "@/store";
import type { AmllLyricContent } from "@/types/ws";
import {
	LYRIC_SOURCE_UUID_BUILTIN_AMLL_TTML_DB,
	LyricFormat,
} from "@/utils/source";

export function LyricSync() {
	const setLyric = useSetAtom(lyricAtom);
	const songInfo = useAtomValue(songInfoAtom);
	const managerRef = useRef<LyricManager | null>(null);

	useEffect(() => {
		const manager = new LyricManager();
		managerRef.current = manager;

		let ncmAdapter: BaseLyricAdapter;

		// 网易云音乐 v2 客户端特有的 NEJ 框架全局对象
		if (window.NEJ) {
			ncmAdapter = new V2LyricAdapter();
		} else {
			ncmAdapter = new V3LyricAdapter();
		}

		const ttmlAdapter = new ExternalLyricAdapter({
			type: "builtin:amll-ttml-db",
			id: LYRIC_SOURCE_UUID_BUILTIN_AMLL_TTML_DB,
			url: "https://raw.githubusercontent.com/amll-dev/amll-ttml-db/main/ncm-lyrics/[NCM_ID].ttml",
			format: LyricFormat.TTML,
			name: "AMLL TTML DB",
		});

		manager.setAdapters([ttmlAdapter, ncmAdapter]);

		const handleLyricUpdate = (event: CustomEvent<AmllLyricContent | null>) => {
			setLyric(event.detail);
		};

		manager.addEventListener("update", handleLyricUpdate);

		manager.init().catch((err) => {
			console.error("[LyricSync] 歌词源初始化期间发生错误", err);
		});

		return () => {
			manager.removeEventListener("update", handleLyricUpdate);
			manager.destroy();
			managerRef.current = null;
		};
	}, [setLyric]);

	useEffect(() => {
		if (songInfo?.ncmId && managerRef.current) {
			managerRef.current.fetchLyric(songInfo);
		}
	}, [songInfo]);

	return null;
}
