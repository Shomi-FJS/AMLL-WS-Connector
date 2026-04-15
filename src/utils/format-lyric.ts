import { isMetadataLine } from "@/core/parsers/metadata";
import type { RawLyricData } from "@/store";

export type RawLyricLine = {
	/**
	 * 单位是秒
	 *
	 * 这个是给网易云音乐用的，其内部使用秒作为单位。非滚动歌词可能为 undefined
	 */
	time?: number;
	lyric: string;
};

export function buildLrcString(lines: RawLyricLine[]): string {
	return lines
		.map((l) => {
			const totalCs = Math.round((l.time ?? 0) * 100);
			const m = Math.floor(totalCs / 6000)
				.toString()
				.padStart(2, "0");
			const s = ((totalCs % 6000) / 100).toFixed(2).padStart(5, "0");

			return `[${m}:${s}]${l.lyric}`;
		})
		.join("\n");
}

export interface FormatRawLyricParams {
	yrc?: string;
	lrcLines?: RawLyricLine[];
	trans?: string | RawLyricLine[];
	roma?: string | RawLyricLine[];
	scrollable?: boolean;
}

export function extractRawLyricData(
	params: FormatRawLyricParams,
): RawLyricData | null {
	const resolveContent = (
		content?: string | RawLyricLine[],
	): string | undefined => {
		if (!content) return undefined;

		if (typeof content === "string") {
			const trimmed = content.trim();
			return trimmed.length > 0 ? trimmed : undefined;
		}

		if (content.length > 0) {
			if (params.scrollable === false) {
				return content.map((l) => l.lyric).join("\n");
			}
			return buildLrcString(content);
		}

		return undefined;
	};

	const trans = resolveContent(params.trans);
	const roma = resolveContent(params.roma);

	const yrcLines = params.yrc?.split("\n").filter((line) => {
		return !isMetadataLine(line);
	});
	const cleanYrc =
		yrcLines && yrcLines.length > 0 ? yrcLines.join("\n") : undefined;

	if (cleanYrc) {
		return {
			main: cleanYrc,
			trans,
			roma,
			scrollable: params.scrollable,
		};
	}

	const contentLines = params.lrcLines?.filter((l) => {
		return (l.time ?? 0) >= 0 && !isMetadataLine(l.lyric);
	});

	if (contentLines && contentLines.length > 0) {
		return {
			main:
				params.scrollable === false
					? contentLines.map((l) => l.lyric).join("\n")
					: buildLrcString(contentLines),
			trans,
			roma,
			scrollable: params.scrollable,
		};
	}

	return null;
}
