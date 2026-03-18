export interface LrcLine {
	/**
	 * 单位为毫秒
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
