import { feature } from "bun:bundle";
import { isMetadataLine } from "@/core/parsers/lrcParser";
import {
	buildAmllLyricLines,
	mergeSubLyrics,
} from "@/core/parsers/lyricBuilder";
import { parseYrc } from "@/core/parsers/yrcParser";
import type { v2 } from "@/types/ncm";
import type { AmllLyricContent, AmllLyricLine } from "@/types/ws";
import { extractRawLyricData } from "@/utils/format-lyric";
import { LYRIC_SOURCE_UUID_BUILTIN_NCM } from "@/utils/source";
import { isFilterMetadataEnabled } from "@/store";
import { BaseLyricAdapter } from "../BaseLyricAdapter";

function matchByTimestampV2(
	lines: Array<{ time: number; lyric: string }>,
	targetTimeMs: number,
): string {
	if (lines.length === 0) return "";

	let bestIdxMs = -1, bestDiffMs = Infinity;
	let bestIdxSec = -1, bestDiffSec = Infinity;

	for (let i = 0; i < lines.length; i++) {
		const timeVal = lines[i].time;
		const diffMs = Math.abs(timeVal - targetTimeMs);
		if (diffMs < bestDiffMs) {
			bestDiffMs = diffMs;
			bestIdxMs = i;
		}
		const diffSec = Math.abs(timeVal * 1000 - targetTimeMs);
		if (diffSec < bestDiffSec) {
			bestDiffSec = diffSec;
			bestIdxSec = i;
		}
	}

	const TOLERANCE = 3000;
	if (bestDiffMs <= TOLERANCE && bestDiffMs <= bestDiffSec) {
		return lines[bestIdxMs].lyric;
	}
	if (bestDiffSec <= TOLERANCE && bestDiffSec < bestDiffMs) {
		return lines[bestIdxSec].lyric;
	}
	return "";
}

/**
 * 批量时间戳匹配（v2 版）— 两轮去重匹配
 *
 * 第一轮：严格容差 3s，确保精确对齐
 * 第二轮：放宽容差 15s，为未命中的目标找最近剩余源
 * 兼容 v2 时间单位不确定的问题（可能是秒或毫秒）
 */
function matchTranslationsByTimeV2(
	sources: Array<{ time: number; lyric: string }>,
	targetTimes: number[],
): string[] {
	if (sources.length === 0 || targetTimes.length === 0) {
		return new Array(targetTimes.length).fill("");
	}

	const result: string[] = new Array(targetTimes.length).fill("");

	const calcDiff = (srcIdx: number, targetMs: number): number => {
		const srcTime = Number(sources[srcIdx].time);
		if (Number.isNaN(srcTime)) return Infinity;
		const diffMs = Math.abs(srcTime - targetMs);
		const diffSec = Math.abs(srcTime * 1000 - targetMs);
		return Math.min(diffMs, diffSec);
	};

	const candidates = targetTimes.map((t, ti) => {
		let bestIdx = -1;
		let bestDiff = Infinity;
		for (let i = 0; i < sources.length; i++) {
			const d = calcDiff(i, t);
			if (d < bestDiff) {
				bestDiff = d;
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
					const d = calcDiff(i, targetTimes[c.ti]);
					if (d < altDiff) {
						altDiff = d;
						altBest = i;
					}
				}
				if (altBest >= 0 && altDiff <= tolerance) {
					result[c.ti] = sources[altBest].lyric;
					srcUsed.add(altBest);
				}
			} else if (c.diff <= tolerance) {
				result[c.ti] = sources[c.srcIdx].lyric;
				srcUsed.add(c.srcIdx);
			}
		}
	};

	assign(3000);
	assign(15000);

	for (const c of candidates) {
		if (result[c.ti]) continue;
		result[c.ti] = sources[c.srcIdx].lyric;
	}

	return result;
}

export class V2LyricAdapter extends BaseLyricAdapter {
	public readonly id = LYRIC_SOURCE_UUID_BUILTIN_NCM;

	private originalGe: v2.NejEventBus["Ge"] | null = null;
	private eventBus: v2.NejEventBus | null = null;

	private baseLyric: AmllLyricContent | null = null;
	private currentOffset: number = 0;

	public async init(): Promise<boolean> {
		const bus = window.NEJ?.P(
			/* 名字空间申明 */ "nej.v" /* 事件接口名字空间 */,
		);

		if (
			bus &&
			typeof bus.Ge /* _$dispatchEvent */ === "function" &&
			typeof bus.Ge.e9 /* _$aop */ === "function"
		) {
			this.eventBus = bus;
			this.originalGe = bus.Ge;

			this.eventBus.Ge /* _$dispatchEvent */ = this.originalGe.e9(
				/* _$aop */ (event) => {
					const eventName = event.args[1];
					const payload = event.args[2];

					if (typeof eventName !== "string") return;

					try {
						if (eventName === "lrcload") {
							if (feature("DEV")) {
								console.log("截获 lrcload", payload);
							}

							this.handleLrcLoad(payload as v2.LrcLoadPayload);
						} else if (eventName === "lrctimeupdate") {
							this.handleLrcTimeUpdate(payload as v2.LrcTimeUpdatePayload);
						}
					} catch (err) {
						console.error(`[V2LyricAdapter] 处理事件 ${eventName} 失败`, err);
					}
				},
			);

			return true;
		}

		console.warn(
			"[V2LyricAdapter] 未找到 NEJ 框架或无法应用 AOP 拦截。请检查当前版本是否为 2.10.13。",
		);
		return false;
	}

	public destroy(): void {
		if (this.eventBus && this.originalGe) {
			this.eventBus.Ge = this.originalGe;
			this.originalGe = null;
			this.eventBus = null;
		}
		this.baseLyric = null;
		this.currentOffset = 0;
	}

	public fetchLyric(): void {
		if (this.baseLyric) {
			this.emitAdjustedLyric();
		}
	}

	private handleLrcLoad(payload: v2.LrcLoadPayload) {
		if (!payload?.lyric) {
			this.dispatch("rawlyric", null);
			return;
		}

		const rawLyricData = extractRawLyricData({
			yrc: payload.lyric.yrc?.lyric,
			lrcLines: payload.lyric.lrc?.lines,
			trans: payload.lyric.tlyric?.lines,
			roma: payload.lyric.romalrc?.lines,
		});

		this.dispatch("rawlyric", rawLyricData);

		this.baseLyric = this.parseV2Payload(payload.lyric);
		if (!this.baseLyric) return;

		this.currentOffset = payload.lyric.lrc?.offset ?? 0;

		this.emitAdjustedLyric();
	}

	private handleLrcTimeUpdate(payload: v2.LrcTimeUpdatePayload): void {
		if (!this.baseLyric || !payload.result) return;

		const newOffset = payload.result.offset ?? 0;

		if (newOffset !== this.currentOffset) {
			this.currentOffset = newOffset;
			this.emitAdjustedLyric();
		}
	}

	private emitAdjustedLyric(): void {
		if (!this.baseLyric) return;

		if (this.currentOffset === 0) {
			this.dispatch("update", this.baseLyric);
			return;
		}

		const adjustedLyric = this.applyOffset(this.baseLyric, this.currentOffset);
		this.dispatch("update", adjustedLyric);
	}

	/**
	 * 时间轴平移计算
	 *
	 * 正数 offset 表示歌词提前显示
	 *
	 * 和 v3 不同，v3 修改 offset 后会直接修改 store 中的歌词时间戳，
	 * 但 v2 只会修改负载属性，需要手动计算
	 */
	private applyOffset(
		baseLyric: AmllLyricContent,
		offset: number,
	): AmllLyricContent {
		if (baseLyric.format !== "structured") {
			return baseLyric;
		}

		const adjustedLines: AmllLyricLine[] = baseLyric.lines.map((line) => {
			return {
				...line,
				startTime: Math.max(0, line.startTime - offset),
				endTime: Math.max(0, line.endTime - offset),
				words: line.words?.map((word) => ({
					...word,
					startTime: Math.max(0, word.startTime - offset),
					endTime: Math.max(0, word.endTime - offset),
				})),
			};
		});

		return {
			format: "structured",
			lines: adjustedLines,
		};
	}

	private parseV2Payload(
		lyricObj: NonNullable<v2.LrcLoadPayload["lyric"]>,
	): AmllLyricContent | null {
		const filterEnabled = isFilterMetadataEnabled();

		if (lyricObj.lrc?.scrollable === false) {
			return {
				format: "structured",
				lines: [],
			};
		}
		if (lyricObj.yrc?.lyric) {
			const allYrcLines = parseYrc(lyricObj.yrc.lyric);

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
						const filteredYrcLines = validIndices.map((i) => allYrcLines[i]);
						const tRawLines = lyricObj.tlyric?.lines ?? [];
						const rRawLines = lyricObj.romalrc?.lines ?? [];

						// Strip metadata blocks from start/end of translation sources
						let tStart = 0;
						while (tStart < tRawLines.length && isMetadataLine(tRawLines[tStart].lyric)) {
							tStart++;
						}
						let tEnd = tRawLines.length - 1;
						while (tEnd >= tStart && isMetadataLine(tRawLines[tEnd].lyric)) {
							tEnd--;
						}
						let rStart = 0;
						while (rStart < rRawLines.length && isMetadataLine(rRawLines[rStart].lyric)) {
							rStart++;
						}
						let rEnd = rRawLines.length - 1;
						while (rEnd >= rStart && isMetadataLine(rRawLines[rEnd].lyric)) {
							rEnd--;
						}

						const tStripped = tRawLines.slice(tStart, tEnd + 1);
						const rStripped = rRawLines.slice(rStart, rEnd + 1);

						const tFiltered = tStripped.filter((l) => !isMetadataLine(l.lyric));
						const rFiltered = rStripped.filter((l) => !isMetadataLine(l.lyric));

						const yrcTimes = validIndices.map((vi) => allYrcLines[vi].startTime);
						const tTexts = matchTranslationsByTimeV2(tFiltered, yrcTimes);
						const romaTexts = matchTranslationsByTimeV2(rFiltered, yrcTimes);

						const mergedLines = mergeSubLyrics(filteredYrcLines, tTexts, romaTexts);

						return {
							format: "structured",
							lines: mergedLines,
						};
					}
				} else {
					const tRawLines = lyricObj.tlyric?.lines ?? [];
					const rRawLines = lyricObj.romalrc?.lines ?? [];

					const tTexts = allYrcLines.map((line) =>
						matchByTimestampV2(tRawLines, line.startTime),
					);
					const romaTexts = allYrcLines.map((line) =>
						matchByTimestampV2(rRawLines, line.startTime),
					);

					return {
						format: "structured",
						lines: mergeSubLyrics(allYrcLines, tTexts, romaTexts),
					};
				}
			}
		}

		if (
			lyricObj.lrc &&
			Array.isArray(lyricObj.lrc.lines) &&
			lyricObj.lrc.lines.length > 0
		) {
			const hasTranslation = lyricObj.tlyric?.lines && lyricObj.tlyric.lines.length > 0;
			const validIndices: number[] = [];
			const rawLrc: LrcLine[] = [];
			const inlineTransTexts: string[] = [];

			for (let i = 0; i < lyricObj.lrc.lines.length; i++) {
				const line = lyricObj.lrc.lines[i];
				if (filterEnabled && isMetadataLine(line.lyric)) {
					continue;
				}

				validIndices.push(i);

				let lyricText = line.lyric;
				let inlineTrans = "";

				if (filterEnabled && lyricText.includes("/")) {
					if (hasTranslation && lyricObj.tlyric?.lines?.[i]?.lyric) {
						const slashIndex = lyricText.lastIndexOf("/");
						const beforeSlash = lyricText.substring(0, slashIndex).trim();
						const afterSlash = lyricText.substring(slashIndex + 1).trim();
						if (afterSlash.length > 0 && beforeSlash.length > 0) {
							lyricText = beforeSlash;
						}
					} else if (!hasTranslation) {
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
					time: lyricObj.lrc.lines[0].time < 1000 ? line.time * 1000 : line.time,
					text: lyricText,
				});
			}

			const allTTexts = lyricObj.tlyric?.lines?.map((l) => l.lyric) ?? [];
			const allRomaTexts =
				lyricObj.romalrc?.lines?.map((l) => l.lyric) ?? [];
			const tTexts = validIndices.map((vi, idx) =>
				allTTexts[vi] || inlineTransTexts[idx] || "",
			);
			const romaTexts = validIndices.map((i) => allRomaTexts[i] || "");

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

		return null;
	}
}
