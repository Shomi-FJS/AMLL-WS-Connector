import { isMetadataLine, stripMetadataBlocks } from "./metadata";

export interface LrcLine {
	/**
	 * 单位为毫秒
	 */
	time: number;
	text: string;
}

/**
 * 尝试将 "原文/译文" 格式的歌词行拆分为原文和译文
 * 某些歌词源把翻译直接拼在原文后面用 "/" 分隔（如 "Hello/你好"），
 * 此函数识别并拆分这类行，返回 null 表示不是内联翻译格式。
 */
export function splitInlineTranslatedLyric(
	text: string,
): { mainText: string; translationText: string } | null {
	const slashIndex = text.lastIndexOf("/");
	if (slashIndex <= 0 || slashIndex >= text.length - 1) return null;
	if (text.includes("://")) return null;
	const mainText = text.substring(0, slashIndex).trim();
	const translationText = text.substring(slashIndex + 1).trim();
	if (!mainText || !translationText) return null;
	if (mainText.length > 80 || translationText.length > 80) return null;
	if (!/[\u4E00-\u9FFFa-zA-Z]/.test(mainText)) return null;
	if (!/[\u4E00-\u9FFFa-zA-Z]/.test(translationText)) return null;
	if (isMetadataLine(mainText) || isMetadataLine(translationText)) return null;
	return { mainText, translationText };
}

/** LRC 解析时的可选配置；filterMetadata 被 ExternalLyricAdapter 使用，不可移除 */
export interface ParseLrcOptions {
	filterMetadata?: boolean;
}

export function parseLrc(lrcStr: string, options?: ParseLrcOptions): LrcLine[] {
	if (!lrcStr) return [];
	const shouldFilter = options?.filterMetadata === true;
	const lines = lrcStr.split("\n");
	const result: LrcLine[] = [];
	const regex =
		/\[(?<min>\d{2,3}):(?<sec>\d{2})(?:\.(?<ms>\d{2,3}))?\](?<text>.*)/;

	for (const line of lines) {
		const match = line.match(regex);
		if (match?.groups) {
			const { min, sec, ms, text } = match.groups;
			if (shouldFilter && isMetadataLine(text)) continue;
			const minVal = parseInt(min, 10);
			const secVal = parseInt(sec, 10);
			let msVal = 0;
			if (ms) {
				msVal = parseInt(ms, 10);
				if (ms.length === 2) msVal *= 10;
			}
			const time = minVal * 60000 + secVal * 1000 + msVal;
			result.push({ time, text });
		}
	}
	return shouldFilter ? stripMetadataBlocks(result) : result;
}
