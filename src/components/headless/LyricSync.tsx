import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import type { BaseLyricAdapter } from "@/adapters/BaseLyricAdapter";
import { V3LyricAdapter } from "@/adapters/v3/adapter";
import { lyricAtom, songInfoAtom } from "@/store";

export function LyricSync() {
	const setLyric = useSetAtom(lyricAtom);
	const songInfo = useAtomValue(songInfoAtom);
	const adapterRef = useRef<BaseLyricAdapter | null>(null);

	useEffect(() => {
		const adapter = new V3LyricAdapter();
		adapterRef.current = adapter;

		adapter.subscribe((lyricContent) => {
			setLyric(lyricContent);
		});

		adapter.init().then((success) => {
			if (!success) {
				console.error("歌词适配器初始化失败");
			}
		});

		return () => {
			if (adapterRef.current) {
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
