import { TTMLParser, toAmllLyrics } from "ttml-processor";
import type { AmllLyricContent } from "@/types/ws";

export function parseTtml(text: string): AmllLyricContent | null {
	try {
		const parsedTtml = TTMLParser.parse(text);

		const availableLangs = new Set<string>();
		for (const line of parsedTtml.lines) {
			if (line.translations) {
				for (const trans of line.translations) {
					if (trans.language) availableLangs.add(trans.language);
				}
			}
		}

		let targetTranslationLanguage: string | undefined;
		let currentScore = -1;

		for (const lang of availableLangs) {
			let score = -1;

			try {
				const locale = new Intl.Locale(lang);
				if (locale.language === "zh") {
					score = 0;

					if (locale.script === "Hans" || locale.region === "CN") {
						score = 2;
					} else if (
						locale.script === "Hant" ||
						locale.region === "TW" ||
						locale.region === "HK" ||
						locale.region === "MO" ||
						locale.region === "SG"
					) {
						score = 1;
					}
				}
			} catch (e) {
				console.error(`解析语言标签 ${lang} 时出错`, e);
				const lowerLang = lang.toLowerCase();
				if (lowerLang.startsWith("zh")) {
					score = 0;
					if (lowerLang.includes("hans") || lowerLang.includes("cn")) {
						score = 2;
					} else if (
						lowerLang.includes("hant") ||
						lowerLang.includes("tw") ||
						lowerLang.includes("hk") ||
						lowerLang.includes("mo") ||
						lowerLang.includes("sg")
					) {
						score = 1;
					}
				}
			}

			if (score > currentScore) {
				currentScore = score;
				targetTranslationLanguage = lang;
			}
		}

		const amllLines = toAmllLyrics(parsedTtml, {
			// targetTranslationLanguage 是未定义的话，toAmllLyrics 会选择第一个翻译
			translationLanguage: targetTranslationLanguage,
		});

		if (amllLines.length === 0) return null;

		return {
			format: "structured",
			lines: amllLines,
		};
	} catch (e) {
		console.error(`[ExternalAdapter] 解析 TTML 歌词失败`, e);
		return null;
	}
}
