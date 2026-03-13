import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import type { BaseLyricAdapter } from "@/adapters/BaseLyricAdapter";
import { V2LyricAdapter } from "@/adapters/v2/adapter";
import { V3LyricAdapter } from "@/adapters/v3/adapter";
import { lyricAtom, songInfoAtom } from "@/store";
import type { AmllLyricContent } from "@/types/ws";

export function LyricSync() {
	const setLyric = useSetAtom(lyricAtom);
	const songInfo = useAtomValue(songInfoAtom);
	const adapterRef = useRef<BaseLyricAdapter | null>(null);

	useEffect(() => {
		let adapter: BaseLyricAdapter;

		// 网易云音乐 v2 客户端特有的 NEJ 框架全局对象
		if (window.NEJ) {
			adapter = new V2LyricAdapter();
		} else {
			adapter = new V3LyricAdapter();
		}

		adapterRef.current = adapter;

		const handleLyricUpdate = (event: CustomEvent<AmllLyricContent | null>) => {
			setLyric(event.detail);
		};

		adapter.addEventListener("update", handleLyricUpdate);

		adapter.init().then((success) => {
			if (!success) {
				console.error("歌词适配器初始化失败");
			}
		});

		return () => {
			if (adapterRef.current) {
				adapterRef.current.removeEventListener("update", handleLyricUpdate);
				adapterRef.current.destroy();
				adapterRef.current = null;
			}
		};
	}, [setLyric]);

	useEffect(() => {
		if (songInfo?.ncmId && adapterRef.current) {
			adapterRef.current.fetchLyric();
		}
	}, [songInfo?.ncmId]);

	return null;
}
