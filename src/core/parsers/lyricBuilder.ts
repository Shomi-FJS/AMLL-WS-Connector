import type { AmllLyricLine } from "@/types/ws";
import type { LrcLine } from "./lrcParser";

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

export function buildAmllLyricLines(
	lrcLines: LrcLine[],
	transTexts: string[],
	romaTexts: string[],
): AmllLyricLine[] {
	const parsedLines: AmllLyricLine[] = [];

	for (let i = 0; i < lrcLines.length; i++) {
		const current = lrcLines[i];
		const text = current.text.trim();
		const startTime = Math.max(0, current.time);

		if (!text) {
			if (parsedLines.length > 0) {
				const prevLine = parsedLines[parsedLines.length - 1];
				const safeEndTime = Math.max(prevLine.startTime, startTime);
				prevLine.endTime = safeEndTime;
				prevLine.words[0].endTime = safeEndTime;
			}
			continue;
		}

		const next = lrcLines[i + 1];
		const defaultEndTime = next ? Math.max(0, next.time) : startTime + 100000;
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
