import type { AmllLyricLine, AmllLyricWord } from "@/types/ws";

export function parseYrc(yrcStr: string): AmllLyricLine[] {
	if (!yrcStr) return [];
	const lines = yrcStr.split("\n");
	const result: AmllLyricLine[] = [];

	for (const line of lines) {
		if (!line.trim()) continue;

		const contentMatch = line.match(
			/^\[(?<lineStart>\d+),(?<lineDur>\d+)\](?<content>.*)/,
		);
		const content = contentMatch?.groups?.content ?? line;

		// (wordStart,wordDuration,不知道有什么用的0)wordText
		const wordRegex =
			/\((?<wordStart>\d+),(?<wordDur>\d+),\d+\)(?<wordText>.*?)(?=\(\d+,\d+,\d+\)|$)/g;
		const words: AmllLyricWord[] = [];

		for (const match of content.matchAll(wordRegex)) {
			if (!match.groups) continue;

			const { wordStart: startStr, wordDur: durStr, wordText } = match.groups;
			const wordStart = parseInt(startStr, 10);
			const wordDur = parseInt(durStr, 10);

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
