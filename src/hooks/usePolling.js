import { useState, useEffect, useRef, useCallback } from "react";

export function usePolling({
	fn,
	interval,
	immediate = true,
	enabled = true,
	defaultMinDurationMs = 0,
}) {
	const timerRef = useRef(null);
	const runningRef = useRef(false);

	// overlap-safe pending state
	const pendingCountRef = useRef(0);
	const [pending, setPending] = useState(false);
	const [lastRunAt, setLastRunAt] = useState(null);

	const clearTimer = () => {
		if (timerRef.current != null) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
	};

	const incPending = () => {
		pendingCountRef.current += 1;
		// If we just entered pending from 0 -> 1, flip the state to true
		if (pendingCountRef.current === 1) {
			setPending(true);
		}
	};

	const decPending = () => {
		pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
		// Only when all overlapping ticks finished do we flip to false
		if (pendingCountRef.current === 0) {
			setPending(false);
			setLastRunAt(new Date());
		}
	};

	const runWithMinDuration = useCallback(
		async (minDurationMs = 0) => {
			incPending();
			const started = Date.now();
			try {
				await fn();
			} finally {
				const elapsed = Date.now() - started;
				const remaining = Math.max(0, (minDurationMs || 0) - elapsed);
				if (remaining > 0) {
					await new Promise((r) => setTimeout(r, remaining));
				}
				decPending();
			}
		},
		[fn]
	);

	// Manual one-off tick; can pass a min duration for visual feedback
	const tick = useCallback(
		async (opts) => {
			const min =
				opts && typeof opts.minDurationMs === "number" ? opts.minDurationMs : 0;
			await runWithMinDuration(min);
		},
		[runWithMinDuration]
	);

	const start = useCallback(() => {
		if (runningRef.current) return;
		runningRef.current = true;
		clearTimer();
		timerRef.current = setInterval(() => {
			// auto ticks use the default minimum (often 0)
			void runWithMinDuration(defaultMinDurationMs);
		}, interval);
	}, [interval, defaultMinDurationMs, runWithMinDuration]);

	const stop = useCallback(() => {
		runningRef.current = false;
		clearTimer();
	}, []);

	useEffect(() => {
		if (!enabled) {
			stop();
			return;
		}
		if (immediate) void tick(); // immediate tick, no artificial delay
		start();
		return () => stop();
	}, [enabled, immediate, start, stop, tick]);

	return {
		start,
		stop,
		tick, // call as: tick({ minDurationMs: 1000 })
		isRunning: runningRef.current,
		lastRunAt,
		pending, // true while any tick is in-flight (and through min-duration)
	};
}
