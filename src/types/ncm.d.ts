import type { Dispatch, Store } from "redux";

// --- 通用类型 ---
export interface Artist {
	id: string | undefined | null;
	name: string;
}

export namespace v3 {
	export interface ReduxState {
		"async:lyric": NcmAsyncLyricState;
	}

	export type NcmV3Action = {
		type: "async:lyric/fetchLyric";
		payload: { force: boolean };
	};

	export type NCMStore = Store<ReduxState, NcmV3Action>;

	export interface DvaTool {
		inited: boolean;
		app: DvaApp | null;
		getStore(): ReduxState;
		getDispatch(): Dispatch<NcmV3Action>;
	}

	type DvaApp = {
		_store: v3.NCMStore;
	};

	export interface DvaToolModule {
		a: DvaTool;
	}

	/**
	 * 网易云基础的行歌词格式
	 */
	export interface NcmLyricLine {
		/** 歌词对应的时间，单位为秒 */
		time: number;
		/** 歌词文本 */
		lyric: string;
	}

	/**
	 * 网易云逐字歌词 (YRC) 信息
	 */
	export interface NcmYrcInfo {
		/** 原始 YRC 字符串 */
		yrc: string;
		/** YRC 罗马音字符串 */
		yrcRoma: string;
		/** YRC 翻译字符串 */
		yrcTrans: string;
	}

	/**
	 * 歌词贡献者信息
	 */
	export interface NcmTranslationContributor {
		id: string;
		status: number;
		demand: number;
		userid: string;
		nickname: string;
		uptime: number;
	}

	/**
	 * 网易云 Redux Store 中 `async:lyric` 的完整状态树
	 */
	export interface NcmAsyncLyricState {
		isLoading: boolean;
		lyricLines: NcmLyricLine[];
		currentUsedLyric: string;
		currentUsedLyricVersion: number;
		displayType: string;
		romaLyricLines: NcmLyricLine[];
		tlyricLines: NcmLyricLine[];
		translationEnable: boolean;
		romaEnable: boolean;
		isLyricFetchFailed: boolean;
		askForTranslation: boolean;
		canUploadLyric: boolean;
		canUploadTranslation: boolean;
		offset: number;
		scrollable: boolean;
		yrcInfo?: NcmYrcInfo;
		translationContributor?: NcmTranslationContributor;
		isCloudLyric: boolean;
	}
}
