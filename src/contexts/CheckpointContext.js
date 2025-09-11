import { createContext, useCallback, useMemo } from "react";

export const CheckpointContext = createContext();

export default function CheckpointProvider({ children }) {
	const makeKey = useCallback(
		(sessionId) => (sessionId ? `sess:${sessionId}` : null),
		[]
	);

	const readCheckpoint = useCallback(
		(sessionId) => {
			try {
				const k = makeKey(sessionId);
				if (!k) return null;
				const raw = localStorage.getItem(k);
				return raw ? JSON.parse(raw) : null;
			} catch {
				return null;
			}
		},
		[makeKey]
	);

	const writeCheckpoint = useCallback(
		(sessionId, patch) => {
			try {
				const k = makeKey(sessionId);
				if (!k) return;
				const prev = readCheckpoint(sessionId) || {};
				localStorage.setItem(k, JSON.stringify({ ...prev, ...patch }));
			} catch {}
		},
		[makeKey, readCheckpoint]
	);

	const clearCheckpoint = useCallback(
		(sessionId) => {
			try {
				const k = makeKey(sessionId);
				if (k) localStorage.removeItem(k);
			} catch {}
		},
		[makeKey]
	);

	const value = useMemo(
		() => ({ readCheckpoint, writeCheckpoint, clearCheckpoint }),
		[readCheckpoint, writeCheckpoint, clearCheckpoint]
	);

	return (
		<CheckpointContext.Provider value={value}>
			{children}
		</CheckpointContext.Provider>
	);
}
