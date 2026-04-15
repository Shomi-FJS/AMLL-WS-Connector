import type { AmllLyricLine } from "@/types/ws";
import type { LrcLine } from "./lrcParser";
import { isMetadataLine } from "./metadata";
import { matchTextsByTime } from "./translationMatcher";

export function mergeSubLyrics(
	yrcLines: AmllLyricLine[],
	transTexts: string[],
	romaTexts: string[],
): AmllLyricLine[] {
	for (let i = 0; i < yrcLines.length; i++) {
		yrcLines[i].translatedLyric = transTexts[i] || "";
		yrcLines[i].romanLyric = romaTexts[i] || "";
	}
	return yrcLines;
}

function matchByIndex(
	sources: readonly LrcLine[],
	targetCount: number,
): string[] {
	if (sources.length === 0 || targetCount === 0) {
		return new Array(targetCount).fill("");
	}
	return sources.slice(0, targetCount).map((line) => line.text);
}

export function mergeSubLyricsByTime(
	yrcLines: AmllLyricLine[],
	transLrcLines: LrcLine[],
	romaLrcLines: LrcLine[],
): AmllLyricLine[] {
	if (yrcLines.length === 0) {
		return yrcLines;
	}

	const yrcCount = yrcLines.length;

	const filteredTrans = transLrcLines.filter(
		(l) => !isMetadataLine(l.text) && l.text.trim().length > 0,
	);
	const filteredRoma = romaLrcLines.filter(
		(l) => !isMetadataLine(l.text) && l.text.trim().length > 0,
	);

	const transCount = filteredTrans.length;
	const romaCount = filteredRoma.length;

	let transTexts: string[];
	let romaTexts: string[];

	const sizeThreshold = 0.28;
	const transRatio = transCount / yrcCount;
	const romaRatio = romaCount / yrcCount;

	const calcMedian = (nums: number[]): number => {
		if (nums.length === 0) return Number.POSITIVE_INFINITY;
		const sorted = [...nums].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		return sorted.length % 2 === 1
			? sorted[mid]
			: (sorted[mid - 1] + sorted[mid]) / 2;
	};

	// 仅靠“数量比例”判断按索引可能合并太激进：翻译歌词经常缺行，
	// 一旦缺在中间，后面的翻译会整体错位。因此额外检查 前若干行的时间戳是否大致对齐，对不齐就改走按时间匹配。
	const alignSampleCount = Math.min(8, yrcCount, transCount);
	const transAbsDiffs: number[] = [];
	for (let i = 0; i < alignSampleCount; i++) {
		transAbsDiffs.push(Math.abs(yrcLines[i].startTime - filteredTrans[i].time));
	}
	const transMedianAbsDiff = calcMedian(transAbsDiffs);

	const alignMsThreshold = 650;

	const useIndexForTrans =
		transCount === yrcCount ||
		(transRatio >= 1 - sizeThreshold &&
			transRatio <= 1 + sizeThreshold &&
			transMedianAbsDiff <= alignMsThreshold);

	const useIndexForRoma =
		romaCount === yrcCount ||
		(romaRatio >= 1 - sizeThreshold && romaRatio <= 1 + sizeThreshold);

	if (useIndexForTrans) {
		transTexts = matchByIndex(filteredTrans, yrcCount);
	} else {
		const targetTimes = yrcLines.map((line) => line.startTime);
		transTexts = matchTextsByTime(filteredTrans, targetTimes, {
			getText: (line) => line.text,
			getTimeVariants: (line) => [line.time],
		});
	}

	if (useIndexForRoma) {
		romaTexts = matchByIndex(filteredRoma, yrcCount);
	} else {
		const targetTimes = yrcLines.map((line) => line.startTime);
		romaTexts = matchTextsByTime(filteredRoma, targetTimes, {
			getText: (line) => line.text,
			getTimeVariants: (line) => [line.time],
		});
	}

	return mergeSubLyrics(yrcLines, transTexts, romaTexts);
}

// 构建歌词时的可选配置filterMetadata 被 ExternalLyricAdapter 使用，不敢动。
export interface BuildAmllLyricOptions {
	filterMetadata?: boolean;
}

export function buildAmllLyricLines(
	lrcLines: LrcLine[],
	transTexts: string[],
	romaTexts: string[],
	options?: BuildAmllLyricOptions,
): AmllLyricLine[] {
	const parsedLines: AmllLyricLine[] = [];
	const shouldFilter = options?.filterMetadata === true;

	for (let i = 0; i < lrcLines.length; i++) {
		const current = lrcLines[i];

		const text = current.text.trim();

		if (current.time < 0 || (shouldFilter && isMetadataLine(text))) {
			continue;
		}
		const startTime = Math.max(0, Math.round(current.time));

		if (!text) {
			if (parsedLines.length > 0) {
				const prevLine = parsedLines[parsedLines.length - 1];
				const safeEndTime = Math.max(prevLine.startTime, startTime);
				prevLine.endTime = safeEndTime;
				prevLine.words[0].endTime = safeEndTime;
			}
			continue;
		}

		// 跳过时间戳异常行（元数据/负数/倒退），找到首个有效下一行以计算 endTime
		let nextIdx = i + 1;
		while (nextIdx < lrcLines.length && lrcLines[nextIdx].time <= startTime) {
			nextIdx++;
		}
		const next = lrcLines[nextIdx];

		const defaultEndTime = next
			? Math.max(0, Math.round(next.time))
			: startTime + 100000;
		const safeEndTime = Math.max(startTime, defaultEndTime);

		parsedLines.push({
			startTime,
			endTime: safeEndTime,
			translatedLyric: transTexts[i] || "",
			romanLyric: romaTexts[i] || "",
			words: [
				{
					startTime,
					endTime: safeEndTime,
					word: current.text,
				},
			],
		});
	}

	return parsedLines;
}
