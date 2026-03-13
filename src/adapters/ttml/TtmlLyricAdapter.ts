import { BaseLyricAdapter } from "../BaseLyricAdapter";

export class TtmlLyricAdapter extends BaseLyricAdapter {
	public async init(): Promise<boolean> {
		return true;
	}

	public destroy(): void {}

	public async fetchLyric(musicId?: string | number): Promise<void> {
		if (!musicId) return;

		try {
			const url = `https://raw.githubusercontent.com/amll-dev/amll-ttml-db/main/ncm-lyrics/${musicId}.ttml`;
			const response = await fetch(url);

			if (response.status === 200) {
				const text = await response.text();
				this.dispatch("update", {
					format: "ttml",
					data: text,
				});
			} else {
				this.dispatch("update", null);
			}
		} catch (error) {
			console.error("[TtmlLyricAdapter] 获取 TTML 歌词失败", error);
			this.dispatch("update", null);
		}
	}
}
