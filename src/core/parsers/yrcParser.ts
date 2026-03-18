import type { AmllLyricLine, AmllLyricWord } from "@/types/ws";

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
