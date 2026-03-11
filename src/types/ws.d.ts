export interface AmllArtist {
	id: string;
	name: string;
}

export type AmllRepeatMode = "off" | "all" | "one";

export type AmllStateUpdate =
	| {
			update: "setMusic";
			musicId: string;
			musicName: string;
			albumId: string;
			albumName: string;
			artists: AmllArtist[];
			duration: number;
	  }
	| {
			update: "setCover";
			source: "uri";
			url: string;
	  }
	| {
			update: "setCover";
			source: "data";
			image: {
				mimeType?: string;
				data: string;
			};
	  }
	| {
			update: "progress";
			progress: number;
	  }
	| {
			update: "volume";
			volume: number;
	  }
	| {
			update: "paused";
	  }
	| {
			update: "resumed";
	  }
	| {
			update: "modeChanged";
			repeat: AmllRepeatMode;
			shuffle: boolean;
	  }
	| ({ update: "setLyric" } & AmllLyricContent);

export interface AmllLyricWord {
	startTime: number;
	endTime: number;
	word: string;
	romanWord?: string;
}

export interface AmllLyricLine {
	startTime: number;
	endTime: number;
	words: AmllLyricWord[];
	translatedLyric?: string;
	romanLyric?: string;
	isBG?: boolean;
	isDuet?: boolean;
}

export type AmllLyricContent =
	| {
			format: "structured";
			lines: AmllLyricLine[];
	  }
	| {
			format: "ttml";
			data: string;
	  };

export type AmllCommand =
	| { command: "pause" }
	| { command: "resume" }
	| { command: "forwardSong" }
	| { command: "backwardSong" }
	| { command: "setVolume"; volume: number }
	| { command: "seekPlayProgress"; progress: number }
	| { command: "setRepeatMode"; mode: AmllRepeatMode }
	| { command: "setShuffleMode"; enabled: boolean };

export type AmllMessage =
	| { type: "initialize" }
	| { type: "ping" }
	| { type: "pong" }
	| { type: "command"; value: AmllCommand }
	| { type: "state"; value: AmllStateUpdate };
