declare module "ws" {
	import type { EventEmitter } from "node:events";
	import type { IncomingMessage, Server as HttpServer } from "node:http";
	import type { Socket } from "node:net";

	export default class WebSocket extends EventEmitter {
		static readonly CONNECTING: number;
		static readonly OPEN: number;
		static readonly CLOSING: number;
		static readonly CLOSED: number;
		readonly readyState: number;
		constructor(url: string);
		send(
			data: unknown,
			options?: { binary?: boolean },
			callback?: (error?: Error) => void,
		): void;
		close(): void;
		on(
			event: "message",
			listener: (data: unknown, isBinary: boolean) => void,
		): this;
		on(event: "close" | "error", listener: () => void): this;
		on(event: string, listener: (...args: unknown[]) => void): this;
	}

	export class WebSocketServer extends EventEmitter {
		constructor(options: { noServer?: boolean; server?: HttpServer });
		handleUpgrade(
			request: IncomingMessage,
			socket: Socket,
			head: Buffer,
			callback: (socket: WebSocket) => void,
		): void;
	}
}
