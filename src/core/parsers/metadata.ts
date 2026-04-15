import type { AmllLyricLine } from "@/types/ws";
import type { LrcLine } from "./lrcParser";

const METADATA_KEYWORDS = [
	"作词",
	"作詞",
	"作曲",
	"原唱",
	"制作人",
	"編曲",
	"编曲",
	"吉他",
	"木吉他",
	"贝斯",
	"鼓手",
	"鼓",
	"键盘",
	"钢琴",
	"打击乐",
	"萨克斯",
	"长笛",
	"单簧管",
	"合成器",
	"小号",
	"长号",
	"合唱",
	"和声",
	"和音",
	"配乐",
	"弦乐",
	"混音",
	"母带",
	"录制",
	"录音",
	"演唱",
	"人声",
	"封面",
	"监制",
	"監制",
	"总监",
	"发行",
	"發行",
	"企划",
	"企劃",
	"词",
	"詞",
	"曲",
	"音乐制作",
	"音乐统筹",
	"音乐总监",
	"制作行政",
	"音乐营销",
	"录音工作室",
	"混音工作室",
	"母带后期",
	"后期",
	"出品",
	"项目协力",
	"统筹",
	"来源",
	"营销",
	"总策划",
	"本歌曲来自",
	"视觉设计",
	"宣传发行",
	"企划营销",
	"制作协力",
	"协力",
	"配唱制作",
	"配唱制作人",
	"配唱编写",
	"民乐编写",
	"音频编辑",
	"编程",
	"制作助理",
	"录音助理",
	"指挥",
	"乐队",
	"乐队配器",
	"二胡",
	"古筝",
	"笛子",
	"琵琶",
	"唢呐",
	"扬琴",
	"阮",
	"柳琴",
	"笙",
	"箫",
	"葫芦丝",
	"马头琴",
	"京胡",
	"板胡",
	"三弦",
	"巴乌",
	"第一小提琴",
	"第二小提琴",
	"中提琴",
	"大提琴",
	"小提琴",
	"录音棚",
	"音乐监制",
	"录音师",
	"声音工程师",
	"混音师",
	"混音助理",
	"母带制作",
	"conductor",
	"orchestra",
	"orchestrator",
	"recording studio",
	"music supervisor",
	"recording engineer",
	"sound engineer",
	"mixing engineer",
	"mixing assistant",
	"mastering engineer",
	"engineered",
	"erhu",
	"guzheng",
	"dizi",
	"pipa",
	"suoona",
	"yangqin",
	"ruan",
	"liuqin",
	"sheng",
	"xiao",
	"hulusi",
	"matouqin",
	"violin",
	"electric guitar",
	"keyboards",
	"drums",
	"bass",
	"guitar",
	"percussion",
	"strings arranged",
	"author",
	"arranger",
	"released on",
	"programming",
	"program",
	"midi program",
	"production assistant",
	"op",
	"sp",
	"isrc",
	"pgm",
	"rap",
	"sample",
	"composer",
	"prod",
	"composed by",
	"produced by",
	"出品",
	"采样来自",
	"采样取自",
	"sample from",
	"sampled from",
	"推广",
	"vocal",
	"a&r",
	"音频助理",
	"调教",
	"曲绘",
	"records",
	"版权",
	"文化",
	"特别感谢",
];
const METADATA_KEYWORDS_LOWER = METADATA_KEYWORDS.map((k) => k.toLowerCase());

const ENGLISH_METADATA_PREFIXES = [
	"prod by",
	"produced by",
	"beat prod",
	"composed by",
	"recorded by",
	"recorded at",
	"vocals",
	"vocals recorded at",
	"background vocals",
	"mixed by",
	"mixed at",
	"mastered by",
	"engineered by",
	"assisted by",
	"production assistant",
	"strings arranged & conducted by",
	"program",
];
const METADATA_CODE_PREFIXES = ["isrc", "op", "sp"];
const LRC_TAG_LABELS = new Set([
	"by",
	"ti",
	"ar",
	"al",
	"offset",
	"tool",
	"ve",
]);
const METADATA_LABEL_SEPARATOR_REGEX = /[:：;；]/;
const METADATA_LINE_CACHE_LIMIT = 2048;
const metadataLineCache = new Map<string, boolean>();

function cacheMetadataLineResult(text: string, result: boolean): boolean {
	if (metadataLineCache.size >= METADATA_LINE_CACHE_LIMIT) {
		metadataLineCache.clear();
	}
	metadataLineCache.set(text, result);
	return result;
}

function getMetadataBlockRange(texts: readonly string[]): {
	start: number;
	end: number;
} {
	let start = 0;
	while (start < texts.length && isMetadataLine(texts[start])) {
		start++;
	}
	let end = texts.length - 1;
	while (end >= start && isMetadataLine(texts[end])) {
		end--;
	}
	return { start, end };
}

export function isMetadataLine(text: string): boolean {
	if (!text) return false;
	const cached = metadataLineCache.get(text);
	if (cached !== undefined) return cached;

	// 有些歌曲的数据里有"康熙部首"类的兼容性字符（如 ⾳ U+2FB3 和 音 U+97F3 长得相差不多 但码位不同），
	// 用 NFKC 归一化一把，把它们统一成常规形态再比较清洗，规范歌词。
	const normalized = text.normalize("NFKC");
	const trimmed = normalized.trim();
	if (trimmed.length === 0) return cacheMetadataLineResult(text, false);

	if (trimmed.startsWith('{"t":') && trimmed.endsWith("}")) {
		return cacheMetadataLineResult(text, true);
	}

	if (
		/^~[^~]+~$/.test(trimmed) ||
		/^-+$/.test(trimmed) ||
		/^\.+$/.test(trimmed)
	) {
		return cacheMetadataLineResult(text, true);
	}

	const trimmedLower = trimmed.toLowerCase();
	const labelSeparatorIndex = trimmed.search(METADATA_LABEL_SEPARATOR_REGEX);

	if (labelSeparatorIndex > 0) {
		const label = trimmed.substring(0, labelSeparatorIndex).trim();
		const labelLower = label.toLowerCase();

		for (let i = 0; i < METADATA_KEYWORDS.length; i++) {
			const keyword = METADATA_KEYWORDS[i];
			const kwLower = METADATA_KEYWORDS_LOWER[i];
			if (keyword.length <= 1) {
				if (labelLower === kwLower) return cacheMetadataLineResult(text, true);
			} else if (labelLower === kwLower || labelLower.includes(kwLower)) {
				return cacheMetadataLineResult(text, true);
			}
		}

		for (const code of METADATA_CODE_PREFIXES) {
			if (labelLower === code || labelLower.includes(code))
				return cacheMetadataLineResult(text, true);
		}

		if (LRC_TAG_LABELS.has(labelLower))
			return cacheMetadataLineResult(text, true);
	} else {
		for (const keyword of METADATA_KEYWORDS_LOWER) {
			if (trimmedLower === keyword) return cacheMetadataLineResult(text, true);
			if (
				trimmedLower === `${keyword} by` ||
				trimmedLower.startsWith(`${keyword} by `)
			)
				return cacheMetadataLineResult(text, true);
		}
		// 支持 "/" 分隔的复合标签，如 "编曲/混音/制作"
		if (trimmedLower.includes("/")) {
			const parts = trimmedLower.split("/");
			for (const part of parts) {
				const partTrimmed = part.trim();
				for (const keyword of METADATA_KEYWORDS_LOWER) {
					if (
						partTrimmed === keyword ||
						partTrimmed.startsWith(`${keyword} `)
					) {
						return cacheMetadataLineResult(text, true);
					}
				}
			}
		}
		for (const prefix of ENGLISH_METADATA_PREFIXES) {
			if (trimmedLower.startsWith(prefix))
				return cacheMetadataLineResult(text, true);
		}
		for (const code of METADATA_CODE_PREFIXES) {
			if (trimmedLower.startsWith(`${code} `))
				return cacheMetadataLineResult(text, true);
		}
		if (
			trimmedLower.includes("未经") &&
			(trimmedLower.includes("著作权") || trimmedLower.includes("版权"))
		)
			return cacheMetadataLineResult(text, true);
		if (
			trimmed.startsWith("/") ||
			trimmed.startsWith("©") ||
			trimmed.startsWith("/©")
		)
			return cacheMetadataLineResult(text, true);
	}

	if (
		trimmed.includes("/") &&
		(trimmed.includes("词") || trimmed.includes("曲"))
	) {
		const parts = trimmed.split(METADATA_LABEL_SEPARATOR_REGEX);
		if (parts.length > 0) {
			const header = parts[0].trim();
			if (
				header.includes("词") &&
				header.includes("曲") &&
				header.length <= 10
			) {
				return cacheMetadataLineResult(text, true);
			}
		}
	}

	return cacheMetadataLineResult(text, false);
}

export function stripMetadataBlocks<T extends { text: string }>(
	lines: T[],
): T[] {
	if (lines.length === 0) return lines;
	const { start, end } = getMetadataBlockRange(lines.map((line) => line.text));
	return lines.slice(start, end + 1);
}

export function filterMetadataTextLines<T>(
	lines: T[],
	getText: (line: T) => string,
): T[] {
	if (lines.length === 0) return lines;
	const lineTexts = lines.map((line) => getText(line).trim());
	const { start, end } = getMetadataBlockRange(lineTexts);
	const result: T[] = [];
	for (let i = start; i <= end; i++) {
		if (!isMetadataLine(lineTexts[i])) result.push(lines[i]);
	}
	return result;
}

export function filterStructuredLyricLines(
	lines: AmllLyricLine[],
): AmllLyricLine[] {
	return filterMetadataTextLines(lines, (line) =>
		line.words
			.map((w) => w.word)
			.join("")
			.trim(),
	);
}

export function filterTimedLyricLines<T extends { lyric: string }>(
	lines: T[],
): T[] {
	return filterMetadataTextLines(lines, (line) => line.lyric);
}

export function trimAlignedLyricTracks(
	lrcLines: LrcLine[],
	transTexts: string[],
	romaTexts: string[],
): { lrcLines: LrcLine[]; transTexts: string[]; romaTexts: string[] } {
	if (lrcLines.length === 0) return { lrcLines, transTexts, romaTexts };
	const { start, end } = getMetadataBlockRange(
		lrcLines.map((line) => line.text),
	);
	if (start === 0 && end === lrcLines.length - 1)
		return { lrcLines, transTexts, romaTexts };
	return {
		lrcLines: lrcLines.slice(start, end + 1),
		transTexts: transTexts.slice(start, end + 1),
		romaTexts: romaTexts.slice(start, end + 1),
	};
}
