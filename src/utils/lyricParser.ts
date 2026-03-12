import type { AmllLyricLine, AmllLyricWord } from "@/types/ws";

export function parseLrc(lrcStr: string): { time: number; text: string }[] {
	if (!lrcStr) return [];
	const lines = lrcStr.split("\n");
	const result = [];
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

export function parseYrcStr(yrcStr: string): AmllLyricLine[] {
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
