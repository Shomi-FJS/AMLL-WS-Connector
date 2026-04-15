/**
 * @fileoverview
 * V2 / V3 适配器共享的网易云歌词解析逻辑
 * 将原先分别写在 V2LyricAdapter 和 V3LyricAdapter 中的解析代码
 * 抽取为通用函数 parseNcmLyricGeneric，通过 NcmLyricDataSource 接口
 * 屏蔽不同版本 API 的数据结构差异，消除重复代码。
 */

import type { LrcLine } from "@/core/parsers/lrcParser";
import { parseLrc, splitInlineTranslatedLyric } from "@/core/parsers/lrcParser";
import {
	buildAmllLyricLines,
	mergeSubLyricsByTime,
} from "@/core/parsers/lyricBuilder";
import {
	filterStructuredLyricLines,
	isMetadataLine,
} from "@/core/parsers/metadata";
import { parseYrc } from "@/core/parsers/yrcParser";
import type { PluginLyricState } from "@/store";

/**
 * 网易云歌词数据源抽象接口
 * V2 和 V3 的 API 返回结构不同（V2 是 lrcLoad payload，V3 是 Redux state），
 * 适配器只需实现此接口即可复用同一套解析逻辑。
 */
export interface NcmLyricDataSource {
	getYrc(): string | undefined;
	getYrcTrans(): string | undefined;
	getYrcRoma(): string | undefined;
	getLrcLines(): Array<{ time?: number; lyric: string }> | undefined;
	getTlyricLines(): Array<{ time?: number; lyric: string }> | undefined;
	getRomaLyricLines(): Array<{ time?: number; lyric: string }> | undefined;
	isScrollable(): boolean;
}

/**
 * 通用网易云歌词解析
 * 按优先级依次尝试：YRC 逐字歌词 → LRC 逐行歌词，
 * 并合并翻译和音译。支持不可滚动歌词的降级处理。
 *
 * @param source   数据源抽象，由 V2/V3 适配器分别实现
 * @param filterEnabled 是否在解析阶段过滤元数据行；
 *                      当前 V2/V3 均传 false，过滤推迟到 AmllStateSync 发送阶段
 */
export function parseNcmLyricGeneric(
	source: NcmLyricDataSource,
	filterEnabled: boolean,
): PluginLyricState | null {
	// 不可滚动歌词：仅保留纯文本，无逐行时间轴
	if (source.isScrollable() === false) {
		const lines = source.getLrcLines() || [];
		const rawText = lines
			.filter((l) => {
				return (
					(l.time ?? 0) >= 0 &&
					(filterEnabled ? !isMetadataLine(l.lyric) : true)
				);
			})
			.map((l) => l.lyric)
			.join("\n");

		return {
			type: "unscrollable",
			rawText,
			payload: {
				format: "structured",
				lines: [],
			},
		};
	}

	// 优先尝试 YRC 逐字歌词格式
	const yrc = source.getYrc();
	if (yrc) {
		const allYrcLines = parseYrc(yrc);
		const yrcLines = filterEnabled
			? filterStructuredLyricLines(allYrcLines)
			: allYrcLines;

		if (yrcLines.length > 0) {
			const yrcTrans = source.getYrcTrans();
			const yrcRoma = source.getYrcRoma();

			let tLrcLines: LrcLine[];
			let romaLrcLines: LrcLine[];

			if (yrcTrans) {
				tLrcLines = parseLrc(yrcTrans, { filterMetadata: filterEnabled });
			} else {
				tLrcLines = (source.getTlyricLines() || [])
					.filter((l) => (filterEnabled ? !isMetadataLine(l.lyric) : true))
					.map((l) => ({ time: (l.time ?? 0) * 1000, text: l.lyric }));
			}

			if (yrcRoma) {
				romaLrcLines = parseLrc(yrcRoma, { filterMetadata: filterEnabled });
			} else {
				romaLrcLines = (source.getRomaLyricLines() || [])
					.filter((l) => (filterEnabled ? !isMetadataLine(l.lyric) : true))
					.map((l) => ({ time: (l.time ?? 0) * 1000, text: l.lyric }));
			}

			return {
				type: "scrollable",
				payload: {
					format: "structured",
					lines: mergeSubLyricsByTime(yrcLines, tLrcLines, romaLrcLines),
				},
			};
		}
	}

	// 降级到 LRC 逐行歌词格式
	const lines = source.getLrcLines();
	if (!lines || !Array.isArray(lines) || lines.length === 0) {
		return null;
	}

	// 无独立翻译时，尝试拆分 "原文/译文" 内联格式
	const hasTranslation = (source.getTlyricLines()?.length ?? 0) > 0;
	const rawLrc: LrcLine[] = [];
	const inlineTransTexts: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		let lyricText = line.lyric;
		let inlineTrans = "";

		if (!hasTranslation) {
			const inlinePair = splitInlineTranslatedLyric(lyricText);
			if (inlinePair) {
				lyricText = inlinePair.mainText;
				inlineTrans = inlinePair.translationText;
			}
		}

		inlineTransTexts.push(inlineTrans);
		rawLrc.push({
			time: (line.time ?? 0) * 1000,
			text: lyricText,
		});
	}

	const tTexts = rawLrc.map(
		(_, idx) =>
			source.getTlyricLines()?.[idx]?.lyric ?? inlineTransTexts[idx] ?? "",
	);
	const romaTexts = rawLrc.map(
		(_, idx) => source.getRomaLyricLines()?.[idx]?.lyric ?? "",
	);

	return {
		type: "scrollable",
		payload: {
			format: "structured",
			lines: buildAmllLyricLines(rawLrc, tTexts, romaTexts, {
				filterMetadata: filterEnabled,
			}),
		},
	};
}
