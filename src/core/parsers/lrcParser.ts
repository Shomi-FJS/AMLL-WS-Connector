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
	const regex =
		/\[(?<min>\d{2,3}):(?<sec>\d{2})(?:\.(?<ms>\d{2,3}))?\](?<text>.*)/;

	for (const line of lines) {
		const match = line.match(regex);
		if (match?.groups) {
			const { min, sec, ms, text: rawText } = match.groups;

			const minVal = parseInt(min, 10);
			const secVal = parseInt(sec, 10);
			let msVal = 0;
			if (ms) {
				msVal = parseInt(ms, 10);
				if (ms.length === 2) msVal *= 10;
			}

			const time = minVal * 60000 + secVal * 1000 + msVal;
			const text = rawText.trim();

			if (text) {
				result.push({ time, text });
			}
		}
	}
	return result;
}
