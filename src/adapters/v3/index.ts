import type { v3 } from "@/types/ncm";
import type { AmllLyricContent } from "@/types/ws";
import {
	buildAmllLyricLines,
	type LrcLine,
	mergeSubLyrics,
	parseLrc,
	parseYrc,
} from "@/utils/lyricParser";
import { LYRIC_SOURCE_UUID_BUILTIN_NCM } from "@/utils/source";
import {
	findModule,
	getWebpackRequire,
	type WebpackRequire,
} from "@/utils/webpack";
import { BaseLyricAdapter } from "../BaseLyricAdapter";

export class V3LyricAdapter extends BaseLyricAdapter {
	public readonly id = LYRIC_SOURCE_UUID_BUILTIN_NCM;

	private store: v3.NCMStore | null = null;
	private unsubscribeRedux: (() => void) | null = null;
	private lastSentLyricJson: string | null = null;
	private initTimer: ReturnType<typeof setInterval> | null = null;

	public async init(): Promise<boolean> {
		try {
			const requireInstance = await getWebpackRequire();

			return await new Promise<boolean>((resolve) => {
				let attempts = 0;
				const maxAttempts = 20;

				const checkStore = () => {
					attempts++;
					this.store = this.findReduxStoreFromDva(requireInstance);

					if (this.store) {
						if (this.initTimer) clearInterval(this.initTimer);
						this.initTimer = null;

						this.unsubscribeRedux = this.store.subscribe(() => {
							this.handleStoreUpdate();
						});

						this.handleStoreUpdate();
						resolve(true);
					} else if (attempts >= maxAttempts) {
						if (this.initTimer) clearInterval(this.initTimer);
						this.initTimer = null;

						console.warn("[V3LyricAdapter] 寻找 Dva Redux Store 超时");
						resolve(false);
					}
				};

				checkStore();
				if (!this.store && attempts < maxAttempts) {
					this.initTimer = setInterval(checkStore, 1000);
				}
			});
		} catch (e) {
			console.error("[V3LyricAdapter] 初始化失败", e);
			return false;
		}
	}

	public destroy(): void {
		if (this.initTimer) {
			clearInterval(this.initTimer);
			this.initTimer = null;
		}

		if (this.unsubscribeRedux) {
			this.unsubscribeRedux();
			this.unsubscribeRedux = null;
		}

		this.store = null;
		this.lastSentLyricJson = null;
	}

	private handleStoreUpdate() {
		if (!this.store) return;

		const state = this.store.getState();
		const lyricState = state["async:lyric"];

		if (!lyricState || lyricState.isLoading) return;

		const amllLyric = this.parseNcmLyric(lyricState);
		if (!amllLyric) return;

		const currentJson = JSON.stringify(amllLyric);

		if (currentJson === this.lastSentLyricJson) {
			return;
		}

		this.lastSentLyricJson = currentJson;

		this.dispatch("update", amllLyric);
	}

	public fetchLyric(): void {
		this.lastSentLyricJson = null;

		// async:lyric 只有在用户打开了会显示歌词的页面或者组件才会有歌词
		// dispatch 这个 action 以便我们无论如何都能获取到歌词
		if (this.store) {
			this.store.dispatch({
				type: "async:lyric/fetchLyric",
				payload: { force: true },
			});
		}
	}

	private parseNcmLyric(
		rawState: v3.NcmAsyncLyricState,
	): AmllLyricContent | null {
		if (rawState.yrcInfo?.yrc) {
			const yrcLines = parseYrc(rawState.yrcInfo.yrc);

			if (yrcLines.length > 0) {
				const tTexts = parseLrc(rawState.yrcInfo.yrcTrans || "").map(
					(l) => l.text,
				);
				const romaTexts = parseLrc(rawState.yrcInfo.yrcRoma || "").map(
					(l) => l.text,
				);

				return {
					format: "structured",
					lines: mergeSubLyrics(yrcLines, tTexts, romaTexts),
				};
			}
		}

		const lines = rawState.lyricLines;
		if (!lines || !Array.isArray(lines) || lines.length === 0) {
			return null;
		}

		const rawLrc: LrcLine[] = lines.map((l) => ({
			time: l.time,
			text: l.lyric,
		}));
		const tTexts = rawState.tlyricLines?.map((l) => l.lyric) ?? [];
		const romaTexts = rawState.romaLyricLines?.map((l) => l.lyric) ?? [];

		return {
			format: "structured",
			lines: buildAmllLyricLines(rawLrc, tTexts, romaTexts),
		};
	}

	private findReduxStoreFromDva(require: WebpackRequire): v3.NCMStore | null {
		try {
			const dvaModule = findModule<v3.DvaToolModule>(
				require,
				(exports: unknown): exports is v3.DvaToolModule => {
					return (
						!!exports &&
						typeof exports === "object" &&
						"a" in exports &&
						!!exports.a &&
						typeof exports.a === "object" &&
						"getStore" in exports.a &&
						typeof exports.a.getStore === "function"
					);
				},
			);

			if (
				dvaModule?.a.inited &&
				dvaModule.a.app?._store &&
				typeof dvaModule.a.app._store.subscribe === "function"
			) {
				return dvaModule.a.app._store;
			}
		} catch (e) {
			console.error("[V3LyricAdapter] 通过 dva-tool 寻找 Store 时发生错误:", e);
		}

		return null;
	}
}
