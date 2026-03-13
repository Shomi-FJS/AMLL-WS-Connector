import type {
	BaseLyricAdapter,
	LyricAdapterEventMap,
} from "@/adapters/BaseLyricAdapter";
import type { AmllLyricContent } from "@/types/ws";
import { TypedEventTarget } from "@/utils/TypedEventTarget";

export class LyricManager extends TypedEventTarget<LyricAdapterEventMap> {
	private ncmAdapter: BaseLyricAdapter;
	private ttmlAdapter: BaseLyricAdapter;

	private ncmLyric: AmllLyricContent | null = null;
	private ttmlLyric: AmllLyricContent | null = null;
	private currentMusicId: string | number | null = null;

	constructor(ncmAdapter: BaseLyricAdapter, ttmlAdapter: BaseLyricAdapter) {
		super();
		this.ncmAdapter = ncmAdapter;
		this.ttmlAdapter = ttmlAdapter;

		this.handleNcmUpdate = this.handleNcmUpdate.bind(this);
		this.handleTtmlUpdate = this.handleTtmlUpdate.bind(this);

		this.ncmAdapter.addEventListener("update", this.handleNcmUpdate);
		this.ttmlAdapter.addEventListener("update", this.handleTtmlUpdate);
	}

	public async init(): Promise<boolean> {
		const [ncmSuccess, ttmlSuccess] = await Promise.all([
			this.ncmAdapter.init(),
			this.ttmlAdapter.init(),
		]);
		return ncmSuccess && ttmlSuccess;
	}

	public destroy(): void {
		this.ncmAdapter.removeEventListener("update", this.handleNcmUpdate);
		this.ttmlAdapter.removeEventListener("update", this.handleTtmlUpdate);

		this.ncmAdapter.destroy();
		this.ttmlAdapter.destroy();
	}

	public fetchLyric(musicId: string | number): void {
		if (this.currentMusicId !== musicId) {
			this.currentMusicId = musicId;
			this.ncmLyric = null;
			this.ttmlLyric = null;
			this.dispatch("update", null);
		}

		this.ttmlAdapter.fetchLyric(musicId);
		this.ncmAdapter.fetchLyric(musicId);
	}

	private handleNcmUpdate(event: CustomEvent<AmllLyricContent | null>) {
		this.ncmLyric = event.detail;
		this.evaluateAndDispatch();
	}

	private handleTtmlUpdate(event: CustomEvent<AmllLyricContent | null>) {
		this.ttmlLyric = event.detail;
		this.evaluateAndDispatch();
	}

	private evaluateAndDispatch() {
		if (this.ttmlLyric) {
			this.dispatch("update", this.ttmlLyric);
			return;
		}

		if (this.ncmLyric) {
			this.dispatch("update", this.ncmLyric);
		}
	}
}
