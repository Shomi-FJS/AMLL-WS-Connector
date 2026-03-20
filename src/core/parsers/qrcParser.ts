import type { AmllLyricLine, AmllLyricWord } from "@/types/ws";

export function parseQrc(qrcStr: string): AmllLyricLine[] {
	const lines = qrcStr.split(/\r?\n/);
	const parsedLines: AmllLyricLine[] = [];

	// [start,duration]Word (start,duration)word(start,duration)
	const lineRegex = /^\[(\d+),(\d+)\](.*)$/;
	const wordRegex = /(.*?)\((\d+),(\d+)\)/g;

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine) continue;

		const lineMatch = trimmedLine.match(lineRegex);
		if (!lineMatch) continue;

		const lineContent = lineMatch[3];

		const words: AmllLyricWord[] = [];

		for (const wordMatch of lineContent.matchAll(wordRegex)) {
			const wordText = wordMatch[1];
			const startTime = parseInt(wordMatch[2], 10);
			const duration = parseInt(wordMatch[3], 10);

			words.push({
				startTime,
				endTime: startTime + duration,
				word: wordText,
			});
		}

		if (words.length > 0) {
			const fullText = words
				.map((w) => w.word)
				.join("")
				.trim();

			const isBG = /^[(（].*[)）]$/.test(fullText);

			// 丢弃行时间戳以免错误的行时间戳影响到视觉效果
			parsedLines.push({
				startTime: words[0].startTime,
				endTime: words[words.length - 1].endTime,
				words,
				isBG,
			});
		}
	}

	return parsedLines;
}
