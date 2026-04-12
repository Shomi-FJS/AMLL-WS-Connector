import { type LrcLine, isMetadataLine, parseLrc, stripMetadataBlocks } from "@/core/parsers/lrcParser";
import {
	buildAmllLyricLines,
	mergeSubLyrics,
} from "@/core/parsers/lyricBuilder";
import { parseYrc } from "@/core/parsers/yrcParser";
import type { v3 } from "@/types/ncm";
import type { AmllLyricContent } from "@/types/ws";
import { extractRawLyricData } from "@/utils/format-lyric";
import { LYRIC_SOURCE_UUID_BUILTIN_NCM } from "@/utils/source";
import {
	findModule,
	getWebpackRequire,
	type WebpackRequire,
} from "@/utils/webpack";
import { isFilterMetadataEnabled } from "@/store";
import { BaseLyricAdapter } from "../BaseLyricAdapter";

/**
 * 在 LRC 行中找到与目标时间戳最接近的行，返回其文本
 *
 * 用于 YRC 路径中将翻译/罗马音与歌词行对齐，
 * 因为 yrcTrans/yrcRoma 的行数和索引可能与 yrc 不一致（可能包含或不包含元数据翻译行）
 */
function matchByTimestamp(lines: LrcLine[], targetTime: number): string {
	if (lines.length === 0) return "";

	let bestIdx = -1;
	let bestDiff = Infinity;
	for (let i = 0; i < lines.length; i++) {
		const diff = Math.abs(lines[i].time - targetTime);
		if (diff < bestDiff) {
			bestDiff = diff;
			bestIdx = i;
		}
	}

	// 容差 3 秒内才算有效匹配，否则返回空字符串
	return (bestDiff <= 3000 && bestIdx >= 0) ? lines[bestIdx].text : "";
}

/**
 * 批量时间戳匹配 — 按时间顺序为一组 YRC 行分配翻译文本
 *
 * 两轮匹配策略：
 *   第一轮：严格容差（3s），确保精确对齐
 *   第二轮：放宽容差（15s），为未命中的目标找最近剩余源
 *
 * 解决场景：yrcTrans 中重复歌词（如采样段落）只有一条翻译，
 * 严格容差下靠前的目标因距离过远无法命中，两轮机制兜底
 */
function matchTranslationsByTime(
	sources: LrcLine[],
	targetTimes: number[],
): string[] {
	if (sources.length === 0 || targetTimes.length === 0) {
		return new Array(targetTimes.length).fill("");
	}

	const result: string[] = new Array(targetTimes.length).fill("");

	const candidates = targetTimes.map((t, ti) => {
		let bestIdx = -1;
		let bestDiff = Infinity;
		for (let i = 0; i < sources.length; i++) {
			const diff = Math.abs(sources[i].time - t);
			if (diff < bestDiff) {
				bestDiff = diff;
				bestIdx = i;
			}
		}
		return { ti, srcIdx: bestIdx, diff: bestDiff };
	});

	candidates.sort((a, b) => a.diff - b.diff);

	const srcUsed = new Set<number>();

	const assign = (tolerance: number) => {
		for (const c of candidates) {
			if (result[c.ti]) continue;
			if (srcUsed.has(c.srcIdx)) {
				let altBest = -1;
				let altDiff = Infinity;
				for (let i = 0; i < sources.length; i++) {
					if (srcUsed.has(i)) continue;
					const d = Math.abs(sources[i].time - targetTimes[c.ti]);
					if (d < altDiff) {
						altDiff = d;
						altBest = i;
					}
				}
				if (altBest >= 0 && altDiff <= tolerance) {
					result[c.ti] = sources[altBest].text;
					srcUsed.add(altBest);
				}
			} else if (c.diff <= tolerance) {
				result[c.ti] = sources[c.srcIdx].text;
				srcUsed.add(c.srcIdx);
			}
		}
	};

	assign(3000);
	assign(15000);

	for (const c of candidates) {
		if (result[c.ti]) continue;
		result[c.ti] = sources[c.srcIdx].text;
	}

	return result;
}

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
	): AmllLyricContent | null {
		const filterEnabled = isFilterMetadataEnabled();

		if (rawState.scrollable === false) {
			return {
				format: "structured",
				lines: [],
			};
		}

		if (rawState.yrcInfo?.yrc) {
			const allYrcLines = parseYrc(rawState.yrcInfo.yrc);

			if (allYrcLines.length > 0) {
				if (filterEnabled) {
					const lineTexts = allYrcLines.map((yl) =>
						yl.words.map((w) => w.word).join("").trim(),
					);

					let start = 0;
					while (start < lineTexts.length && isMetadataLine(lineTexts[start])) {
						start++;
					}
					let end = lineTexts.length - 1;
					while (end >= start && isMetadataLine(lineTexts[end])) {
						end--;
					}

					const validIndices: number[] = [];
					for (let i = start; i <= end; i++) {
						if (!isMetadataLine(lineTexts[i])) {
							validIndices.push(i);
						}
					}

					if (validIndices.length > 0) {
						const yrcLines = validIndices.map((i) => allYrcLines[i]);
						const tRaw = parseLrc(rawState.yrcInfo.yrcTrans || "", { skipMetadataFilter: true });
						const rRaw = parseLrc(rawState.yrcInfo.yrcRoma || "", { skipMetadataFilter: true });

						const yrcTimes = validIndices.map((vi) => allYrcLines[vi].startTime);
						const tTexts = matchTranslationsByTime(tRaw, yrcTimes);
						const romaTexts = matchTranslationsByTime(rRaw, yrcTimes);

						return {
							format: "structured",
							lines: mergeSubLyrics(yrcLines, tTexts, romaTexts),
						};
					}
				} else {
					const tTexts = parseLrc(rawState.yrcInfo.yrcTrans || "").map(
						(l) => l.text,
					);
					const romaTexts = parseLrc(rawState.yrcInfo.yrcRoma || "").map(
						(l) => l.text,
					);

					return {
						format: "structured",
						lines: mergeSubLyrics(allYrcLines, tTexts, romaTexts),
					};
				}
			}
		}

		const lines = rawState.lyricLines;
		if (!lines || !Array.isArray(lines) || lines.length === 0) {
			return null;
		}

		const hasTranslation = rawState.tlyricLines && rawState.tlyricLines.length > 0;
		const validIndices: number[] = [];
		const rawLrc: LrcLine[] = [];
		// 当无独立翻译行但 lyric 中包含 "原文/翻译" 时，内联提取的翻译
		const inlineTransTexts: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (filterEnabled && isMetadataLine(line.lyric)) {
				continue;
			}

			validIndices.push(i);

			// 当存在独立翻译行时，网易云 LRC 的 lyric 字段可能包含 "原文/翻译" 格式，
			// 需要剥离翻译部分，只保留原文作为正式歌词文本
			let lyricText = line.lyric;
			let inlineTrans = "";

			if (filterEnabled && lyricText.includes("/")) {
				if (hasTranslation && rawState.tlyricLines?.[i]?.lyric) {
					// 有独立翻译行时，剥离 lyric 中 / 后的翻译部分
					const slashIndex = lyricText.lastIndexOf("/");
					const beforeSlash = lyricText.substring(0, slashIndex).trim();
					const afterSlash = lyricText.substring(slashIndex + 1).trim();
					if (afterSlash.length > 0 && beforeSlash.length > 0) {
						lyricText = beforeSlash;
					}
				} else if (!hasTranslation) {
					// 无独立翻译行时，尝试从 "原文/翻译" 中提取内联翻译
					const slashIndex = lyricText.lastIndexOf("/");
					const beforeSlash = lyricText.substring(0, slashIndex).trim();
					const afterSlash = lyricText.substring(slashIndex + 1).trim();
					if (afterSlash.length > 0 && beforeSlash.length > 0) {
						lyricText = beforeSlash;
						inlineTrans = afterSlash;
					}
				}
			}

			inlineTransTexts.push(inlineTrans);
			rawLrc.push({
				// V3 lyricLines 时间单位不一致：部分歌曲为秒，部分为毫秒
				// 通过首行时间值自动检测：如果 < 1000 认为是秒，需要 *1000
				time: lines[0].time < 1000 ? line.time * 1000 : line.time,
				text: lyricText,
			});
		}

		// 翻译文本：优先使用独立翻译行，否则使用内联提取的翻译
		const tTexts = validIndices.map((vi, idx) =>
			rawState.tlyricLines?.[vi]?.lyric || inlineTransTexts[idx] || "",
		);
		const romaTexts = validIndices.map(
			(i) => rawState.romaLyricLines?.[i]?.lyric ?? "",
		);

		if (filterEnabled && rawLrc.length > 0) {
			let start = 0;
			while (start < rawLrc.length && isMetadataLine(rawLrc[start].text)) {
				start++;
			}
			let end = rawLrc.length - 1;
			while (end >= start && isMetadataLine(rawLrc[end].text)) {
				end--;
			}
			if (start > 0 || end < rawLrc.length - 1) {
				rawLrc.splice(0, rawLrc.length, ...rawLrc.slice(start, end + 1));
				tTexts.splice(start, end + 1 - start);
				romaTexts.splice(start, end + 1 - start);
			}
		}

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
