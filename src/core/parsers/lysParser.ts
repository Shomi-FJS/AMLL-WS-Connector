import type { AmllLyricLine, AmllLyricWord } from "@/types/ws";

export function parseLys(lysStr: string): AmllLyricLine[] {
	const lines = lysStr.split(/\r?\n/);
	const parsedLines: AmllLyricLine[] = [];

	// [property]Word (start,duration)word(start,duration)
	const lineRegex = /^\[(?<propertyId>\d+)\](?<lineContent>.*)$/;
	const wordRegex = /(?<wordText>.*?)\((?<startTime>\d+),(?<duration>\d+)\)/g;

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine) continue;

		const lineMatch = trimmedLine.match(lineRegex);
		if (!lineMatch || !lineMatch.groups) continue;

		const { propertyId: propIdStr, lineContent } = lineMatch.groups;
		const propertyId = parseInt(propIdStr, 10);

		// #### 歌词行属性信息
		// | 属性  | 背景人声 | 对唱视图 |
		// | :---: | :------: | :------: |
		// |   0   |  未设置  |  未设置  |
		// |   1   |  未设置  |    左    |
		// |   2   |  未设置  |    右    |
		// |   3   |    否    |  未设置  |
		// |   4   |    否    |    左    |
		// |   5   |    否    |    右    |
		// |   6   |    是    |  未设置  |
		// |   7   |    是    |    左    |
		// |   8   |    是    |    右    |

		// 左侧和未设置均为主唱
		const isDuet = propertyId % 3 === 2;
		const isBG = propertyId >= 6;

		const words: AmllLyricWord[] = [];

		for (const wordMatch of lineContent.matchAll(wordRegex)) {
			if (!wordMatch.groups) continue;

			const {
				wordText,
				startTime: startStr,
				duration: durStr,
			} = wordMatch.groups;
			const startTime = parseInt(startStr, 10);
			const duration = parseInt(durStr, 10);

			words.push({
				startTime,
				endTime: startTime + duration,
				word: wordText,
			});
		}

		if (words.length > 0) {
			parsedLines.push({
				startTime: words[0].startTime,
				endTime: words[words.length - 1].endTime,
				words,
				isBG,
				isDuet,
			});
		}
	}

	return parsedLines;
}
