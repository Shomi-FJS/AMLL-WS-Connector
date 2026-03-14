import type {
	BaseLyricAdapter,
	LyricAdapterEventMap,
} from "@/adapters/BaseLyricAdapter";
import type { SongInfo } from "@/types/inflink";
import type { AmllLyricContent } from "@/types/ws";
import { TypedEventTarget } from "@/utils/TypedEventTarget";

export class LyricManager extends TypedEventTarget<LyricAdapterEventMap> {
	private adapters: BaseLyricAdapter[] = [];
	private caches: Map<string, AmllLyricContent | null> = new Map();

	private currentMusicId: string | number | null = null;

	public async init(): Promise<void> {
		await Promise.all(this.adapters.map((a) => a.init()));
	}

	public destroy(): void {
		for (const adapter of this.adapters) {
			adapter.removeEventListener("update", this.handleAdapterUpdate);
			adapter.destroy();
		}
		this.adapters = [];
		this.caches.clear();
	}

	public setAdapters(adapters: BaseLyricAdapter[]) {
		for (const adapter of this.adapters) {
			adapter.removeEventListener("update", this.handleAdapterUpdate);
		}

		this.adapters = adapters;
		this.caches.clear();
		for (const adapter of this.adapters) {
			adapter.addEventListener("update", this.handleAdapterUpdate);
		}
	}

	public fetchLyric(songInfo: SongInfo): void {
		if (this.currentMusicId !== songInfo.ncmId) {
			this.currentMusicId = songInfo.ncmId;
			this.caches.clear();
			this.dispatch("update", null);
		}

		for (const adapter of this.adapters) {
			adapter.fetchLyric(songInfo);
		}
	}

	private handleAdapterUpdate = (
		event: CustomEvent<AmllLyricContent | null>,
	) => {
		const adapter = event.currentTarget as BaseLyricAdapter;
		const lyric = event.detail;

		this.caches.set(adapter.id, lyric);
		this.evaluateAndDispatch();
	};

	private evaluateAndDispatch() {
		for (const adapter of this.adapters) {
			const cachedLyric = this.caches.get(adapter.id);

			if (cachedLyric) {
				this.dispatch("update", cachedLyric);
				return;
			}
		}
	}
}
