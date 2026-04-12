declare module "chrome-remote-interface" {
	export interface DevtoolsListTarget {
		description?: string;
		devtoolsFrontendUrl?: string;
		faviconUrl?: string;
		id: string;
		title: string;
		type: string;
		url: string;
		webSocketDebuggerUrl?: string;
	}

	export interface RemoteInterfaceOptions {
		host?: string;
		port?: number;
		secure?: boolean;
		target?: string | DevtoolsListTarget | ((targets: DevtoolsListTarget[]) => unknown);
		local?: boolean;
	}

	export interface CdpDomain {
		enable(params?: Record<string, unknown>): Promise<unknown>;
		disable?(params?: Record<string, unknown>): Promise<unknown>;
		[eventOrMethod: string]:
			| ((params?: Record<string, unknown>) => Promise<unknown>)
			| ((handler: (...args: unknown[]) => void) => (() => void))
			| undefined;
	}

	export interface CdpClient {
		Log: CdpDomain & {
			entryAdded(handler: (params: unknown) => void): () => void;
		};
		Runtime: CdpDomain & {
			consoleAPICalled(handler: (params: unknown) => void): () => void;
			exceptionThrown(handler: (params: unknown) => void): () => void;
		};
		send(method: string, params?: Record<string, unknown>): Promise<unknown>;
		close(): Promise<void>;
	}

	interface CdpStatic {
		(options?: RemoteInterfaceOptions): Promise<CdpClient>;
		List(options?: RemoteInterfaceOptions): Promise<DevtoolsListTarget[]>;
		Protocol(options?: RemoteInterfaceOptions): Promise<unknown>;
		Version(options?: RemoteInterfaceOptions): Promise<Record<string, unknown>>;
	}

	const CDP: CdpStatic;
	export default CDP;
}
