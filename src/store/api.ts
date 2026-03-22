/**
 * @fileoverview 封装控制网易云音乐播放的 API
 */

import { atom } from "jotai";
import type { RepeatMode as NCMRepeatMode } from "@/types/inflink";

export const playerApiProviderAtom = atom<typeof window.InfLinkApi | null>(
	null,
);

export const playAtom = atom(null, (get) => {
	get(playerApiProviderAtom)?.play();
});

export const pauseAtom = atom(null, (get) => {
	get(playerApiProviderAtom)?.pause();
});

export const nextAtom = atom(null, (get) => {
	get(playerApiProviderAtom)?.next();
});

export const previousAtom = atom(null, (get) => {
	get(playerApiProviderAtom)?.previous();
});

export const setVolumeAtom = atom(null, (get, _set, volume: number) => {
	get(playerApiProviderAtom)?.setVolume(volume);
});

export const seekToAtom = atom(null, (get, _set, progress: number) => {
	get(playerApiProviderAtom)?.seekTo(progress);
});

export const setRepeatModeAtom = atom(
	null,
	(get, _set, mode: NCMRepeatMode) => {
		get(playerApiProviderAtom)?.setRepeatMode(mode);
	},
);

export const setShuffleModeAtom = atom(
	null,
	(get, _set, targetEnabled: boolean) => {
		const api = get(playerApiProviderAtom);
		if (!api) return;

		const currentMode = api.getPlayMode();
		if (currentMode.isShuffling !== targetEnabled) {
			api.toggleShuffle();
		}
	},
);
