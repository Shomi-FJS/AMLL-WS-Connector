import type { PluginLyricState } from "@/store";
import type { v3 } from "@/types/ncm";
import { extractRawLyricData } from "@/utils/format-lyric";
import { LYRIC_SOURCE_UUID_BUILTIN_NCM } from "@/utils/source";
import {
	findModule,
	getWebpackRequire,
	type WebpackRequire,
} from "@/utils/webpack";
import { BaseLyricAdapter } from "../BaseLyricAdapter";
import {
	type NcmLyricDataSource,
	parseNcmLyricGeneric,
} from "../LyricParserHelper";

export class V3LyricAdapter extends BaseLyricAdapter {
	public readonly id = LYRIC_SOURCE_UUID_BUILTIN_NCM;

	private store: v3.NCMStore | null = null;
	private unsubscribeRedux: (() => void) | null = null;
	private lastSentLyricJson: string | null = null;
	// 上一次观察到的歌词状态 快照，用于 Redux subscribe 回调中的变更检测，避免状态未变时重复解析
	private lastObservedState: Pick<
		v3.NcmAsyncLyricState,
		| "scrollable"
		| "currentUsedLyric"
		| "currentUsedLyricVersion"
		| "yrcInfo"
		| "lyricLines"
		| "tlyricLines"
		| "romaLyricLines"
	> | null = null;
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
		this.lastObservedState = null;
	}

	private handleStoreUpdate() {
		if (!this.store) return;

		const state = this.store.getState();
		const lyricState = state["async:lyric"];

		if (!lyricState || lyricState.isLoading) return;

		// 构建当前歌词状态快照，与上次对比以跳过无变化的更新
		const nextObservedState = {
			scrollable: lyricState.scrollable,
			currentUsedLyric: lyricState.currentUsedLyric,
			currentUsedLyricVersion: lyricState.currentUsedLyricVersion,
			yrcInfo: lyricState.yrcInfo,
			lyricLines: lyricState.lyricLines,
			tlyricLines: lyricState.tlyricLines,
			romaLyricLines: lyricState.romaLyricLines,
		};

		// 所有字段均未变化，跳过本次解析和派发
		if (
			this.lastObservedState &&
			this.lastObservedState.scrollable === nextObservedState.scrollable &&
			this.lastObservedState.currentUsedLyric ===
				nextObservedState.currentUsedLyric &&
			this.lastObservedState.currentUsedLyricVersion ===
				nextObservedState.currentUsedLyricVersion &&
			this.lastObservedState.yrcInfo === nextObservedState.yrcInfo &&
			this.lastObservedState.lyricLines === nextObservedState.lyricLines &&
			this.lastObservedState.tlyricLines === nextObservedState.tlyricLines &&
			this.lastObservedState.romaLyricLines === nextObservedState.romaLyricLines
		) {
			return;
		}

		this.lastObservedState = nextObservedState;

		const amllLyric = this.parseNcmLyric(lyricState);
		if (!amllLyric) {
			this.dispatch("rawlyric", null);
			return;
		}

		const currentJson = JSON.stringify(amllLyric);

		if (currentJson === this.lastSentLyricJson) {
			return;
		}

		this.lastSentLyricJson = currentJson;

		const rawLyricData = extractRawLyricData({
			yrc: lyricState.yrcInfo?.yrc,
			lrcLines: lyricState.lyricLines,
			trans: lyricState.yrcInfo?.yrc
				? lyricState.yrcInfo.yrcTrans
				: lyricState.tlyricLines,
			roma: lyricState.yrcInfo?.yrc
				? lyricState.yrcInfo.yrcRoma
				: lyricState.romaLyricLines,
			scrollable: lyricState.scrollable,
		});

		this.dispatch("rawlyric", rawLyricData);
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
	): PluginLyricState | null {
		// 固定为 false：解析层保留完整数据，元数据过滤由 AmllStateSync 在发送阶段实时处理
		const filterEnabled = false;

		const source: NcmLyricDataSource = {
			getYrc: () => rawState.yrcInfo?.yrc,
			getYrcTrans: () => rawState.yrcInfo?.yrcTrans,
			getYrcRoma: () => rawState.yrcInfo?.yrcRoma,
			getLrcLines: () => rawState.lyricLines,
			getTlyricLines: () => rawState.tlyricLines,
			getRomaLyricLines: () => rawState.romaLyricLines,
			isScrollable: () => rawState.scrollable,
		};

		return parseNcmLyricGeneric(source, filterEnabled);
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
