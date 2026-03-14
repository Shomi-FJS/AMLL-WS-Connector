import type { AmllLyricLine, AmllLyricWord } from "@/types/ws";

export interface LrcLine {
	/**
	 * 单位为秒
	 */
	time: number;
	text: string;
}

export function parseLrc(lrcStr: string): LrcLine[] {
	if (!lrcStr) return [];
	const lines = lrcStr.split("\n");
	const result: LrcLine[] = [];
	const regex = /\[(\d{2,3}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;

	for (const line of lines) {
		const match = line.match(regex);
		if (match) {
			const min = parseInt(match[1], 10);
			const sec = parseInt(match[2], 10);
			let ms = 0;
			if (match[3]) {
				ms = parseInt(match[3], 10);
				if (match[3].length === 2) ms *= 10;
			}
			const time = min * 60000 + sec * 1000 + ms;
			const text = match[4].trim();
			if (text) {
				result.push({ time, text });
			}
		}
	}
	return result;
}

export function parseYrc(yrcStr: string): AmllLyricLine[] {
	if (!yrcStr) return [];
	const lines = yrcStr.split("\n");
	const result: AmllLyricLine[] = [];

	for (const line of lines) {
		if (!line.trim()) continue;

		const contentMatch = line.match(/^\[\d+,\d+\](.*)/);
		const content = contentMatch ? contentMatch[1] : line;

		// (wordStart,wordDuration,不知道有什么用的0)wordText
		const wordRegex = /\((\d+),(\d+),\d+\)(.*?)(?=\(\d+,\d+,\d+\)|$)/g;
		const words: AmllLyricWord[] = [];

		for (const match of content.matchAll(wordRegex)) {
			const wordStart = parseInt(match[1], 10);
			const wordDur = parseInt(match[2], 10);
			const wordText = match[3];

			if (wordText.trim() === "") {
				continue;
			}

			words.push({
				startTime: wordStart,
				endTime: wordStart + wordDur,
				word: wordText,
			});
		}

		if (words.length > 0) {
			// 丢弃行时间戳以免错误的行时间戳影响到视觉效果
			result.push({
				startTime: words[0].startTime,
				endTime: words[words.length - 1].endTime,
				words: words,
				translatedLyric: "",
				romanLyric: "",
			});
		}
	}
	return result;
}

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
		const startTime = Math.max(0, Math.floor(current.time * 1000));

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
		const defaultEndTime = next
			? Math.max(0, Math.floor(next.time * 1000))
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
