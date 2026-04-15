import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	autoReconnectAtom,
	connectionErrorAtom,
	connectionIntentAtom,
	connectionStatusAtom,
	forceReconnectTriggerAtom,
	reconnectDelayAtom,
	wsUrlAtom,
} from "@/store";

interface UseWsConnectionManagerProps {
	onMessage: (event: MessageEvent) => void;
	onConnected?: () => void;
}

export function useWsConnectionManager({
	onMessage,
	onConnected,
}: UseWsConnectionManagerProps) {
	const [intent, setIntent] = useAtom(connectionIntentAtom);
	const forceTrigger = useAtomValue(forceReconnectTriggerAtom);
	const [countdown, setCountdown] = useState<number | null>(null);

	const wsUrl = useAtomValue(wsUrlAtom);
	const autoReconnect = useAtomValue(autoReconnectAtom);
	const reconnectDelay = useAtomValue(reconnectDelayAtom);
	const setStatus = useSetAtom(connectionStatusAtom);
	const setError = useSetAtom(connectionErrorAtom);

	const wsRef = useRef<WebSocket | null>(null);

	const contextRef = useRef({
		onMessage,
		onConnected,
		autoReconnect,
		reconnectDelay,
		setError,
	});
	useEffect(() => {
		contextRef.current = {
			onMessage,
			onConnected,
			autoReconnect,
			reconnectDelay,
			setError,
		};
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: forceTrigger 用来强制重连
	useEffect(() => {
		let intervalId: ReturnType<typeof setInterval> | null = null;

		const clearTimer = () => {
			if (intervalId) clearInterval(intervalId);
			intervalId = null;
			setCountdown(null);
		};

		if (!intent) {
			clearTimer();
			setStatus("disconnected");
			return;
		}

		const initializeWs = () => {
			setStatus("connecting");

			let finalUrl = wsUrl.trim();
			if (
				finalUrl &&
				!finalUrl.startsWith("ws://") &&
				!finalUrl.startsWith("wss://")
			) {
				finalUrl = `ws://${finalUrl}`;
			}

			try {
				const ws = new WebSocket(finalUrl);
				wsRef.current = ws;

				ws.onopen = () => {
					clearTimer();
					setStatus("connected");
					contextRef.current.setError("");
					contextRef.current.onConnected?.();
				};

				ws.onmessage = (event) => {
					contextRef.current.onMessage(event);
				};

				const handleDisconnect = (isError: boolean) => {
					wsRef.current = null;
					setStatus(isError ? "error" : "disconnected");

					if (contextRef.current.autoReconnect) {
						const delaySec = Math.floor(
							contextRef.current.reconnectDelay / 1000,
						);
						contextRef.current.setError(
							isError
								? `连接异常断开，${delaySec} 秒后尝试重连...`
								: `连接已断开，${delaySec} 秒后尝试重连...`,
						);
						startCountdown();
					} else {
						if (isError) {
							contextRef.current.setError(
								"无法连接到 AMLL Player，请检查地址是否正确",
							);
						}
						setIntent(false);
					}
				};

				ws.onclose = () => handleDisconnect(false);
				ws.onerror = () => handleDisconnect(true);
			} catch (e) {
				const errorMessage = e instanceof Error ? e.message : String(e);
				setStatus("error");
				contextRef.current.setError(`WebSocket 地址无效: ${errorMessage}`);
				setIntent(false);
			}
		};

		const startCountdown = () => {
			clearTimer();
			let time = Math.max(
				1,
				Math.floor(contextRef.current.reconnectDelay / 1000),
			);
			setCountdown(time);

			intervalId = setInterval(() => {
				time -= 1;
				if (time <= 0) {
					clearTimer();

					contextRef.current.setError("");

					initializeWs();
				} else {
					setCountdown(time);
				}
			}, 1000);
		};

		initializeWs();

		return () => {
			clearTimer();
			if (wsRef.current) {
				wsRef.current.onclose = null;
				wsRef.current.onerror = null;
				wsRef.current.close();
				wsRef.current = null;
			}
		};
	}, [setIntent, intent, wsUrl, setStatus, forceTrigger]);

	const send = useCallback((data: string | ArrayBuffer) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(data);
		}
	}, []);

	return { send, countdown };
}
