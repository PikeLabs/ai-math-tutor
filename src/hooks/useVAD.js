import { useEffect, useRef, useCallback } from "react";

/**
 * useVAD — VAD with dynamic noise floor and explicit arm(), ref-safe callbacks.
 *
 * Options:
 *  - onSilence: () => void
 *  - shouldCount: () => boolean
 *  - silenceMs, threshold, calibrationMs, pollMs, maxAnswerMs
 */
export function useVAD({
	onSilence,
	shouldCount,
	silenceMs = 1500,
	threshold = 0.03,
	calibrationMs = 300,
	pollMs = 100, // (kept for compatibility; not used with rAF here)
	maxAnswerMs = 45000,
}) {
	const ctxRef = useRef(null);
	const sourceRef = useRef(null);
	const analyserRef = useRef(null);
	const dataRef = useRef(null);
	const rafRef = useRef(null);
	const armTimerRef = useRef(null);

	const armedRef = useRef(false);
	const calibratingRef = useRef(false);
	const noiseFloorRef = useRef(0.01);
	const dynamicThreshRef = useRef(0.04);

	const lastAboveRef = useRef(0);
	const answerStartRef = useRef(0);

	const streamRef = useRef(null);

	// IMPORTANT: keep latest callbacks in refs to avoid stale closures
	const onSilenceRef = useRef(onSilence);
	const shouldCountRef = useRef(shouldCount);
	useEffect(() => {
		onSilenceRef.current = onSilence;
	}, [onSilence]);
	useEffect(() => {
		shouldCountRef.current = shouldCount;
	}, [shouldCount]);

	const stop = useCallback(() => {
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = null;
		if (armTimerRef.current) clearTimeout(armTimerRef.current);
		armTimerRef.current = null;
	}, []);

	const process = useCallback(() => {
		if (!analyserRef.current || !dataRef.current) return;

		analyserRef.current.getFloatTimeDomainData(dataRef.current);
		let sum = 0;
		const buf = dataRef.current;
		for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
		const rms = Math.sqrt(sum / buf.length); // 0..~1

		// use latest gate
		if (!shouldCountRef.current?.()) {
			rafRef.current = requestAnimationFrame(process);
			return;
		}

		if (calibratingRef.current) {
			// EMA for noise floor
			const alpha = 0.2;
			noiseFloorRef.current = (1 - alpha) * noiseFloorRef.current + alpha * rms;
			dynamicThreshRef.current = noiseFloorRef.current + threshold;
			rafRef.current = requestAnimationFrame(process);
			return;
		}

		if (!armedRef.current) {
			rafRef.current = requestAnimationFrame(process);
			return;
		}

		const now = performance.now();
		const isAbove = rms > dynamicThreshRef.current;

		if (isAbove) {
			lastAboveRef.current = now;
		} else {
			const belowFor = now - lastAboveRef.current;
			if (belowFor >= silenceMs) {
				// end-of-speech
				armedRef.current = false;
				onSilenceRef.current?.(); // ← always latest
			}
		}

		// safety timeout
		if (answerStartRef.current && now - answerStartRef.current > maxAnswerMs) {
			armedRef.current = false;
			onSilenceRef.current?.();
		}

		rafRef.current = requestAnimationFrame(process);
	}, [silenceMs, threshold, maxAnswerMs]);

	const arm = useCallback(() => {
		armedRef.current = false; // disarm until calibration completes
		calibratingRef.current = true;
		lastAboveRef.current = performance.now();
		answerStartRef.current = performance.now();

		if (armTimerRef.current) clearTimeout(armTimerRef.current);
		armTimerRef.current = setTimeout(() => {
			calibratingRef.current = false;
			armedRef.current = true;
		}, calibrationMs);
	}, [calibrationMs]);

	const start = useCallback(
		async (mediaStream) => {
			if (!ctxRef.current) {
				const Ctx = window.AudioContext || window.webkitAudioContext;
				ctxRef.current = new Ctx();
			}
			const ctx = ctxRef.current;

			if (streamRef.current !== mediaStream) {
				streamRef.current = mediaStream;

				try {
					sourceRef.current?.disconnect();
				} catch {}
				sourceRef.current = ctx.createMediaStreamSource(mediaStream);

				analyserRef.current = ctx.createAnalyser();
				analyserRef.current.fftSize = 2048;
				analyserRef.current.smoothingTimeConstant = 0.2;

				dataRef.current = new Float32Array(analyserRef.current.fftSize);
				sourceRef.current.connect(analyserRef.current);
			}

			if (!rafRef.current) {
				rafRef.current = requestAnimationFrame(process);
			}
		},
		[process]
	);

	useEffect(() => {
		return () => {
			stop();
			try {
				sourceRef.current?.disconnect();
			} catch {}
			if (ctxRef.current) {
				try {
					ctxRef.current.close();
				} catch {}
			}
			ctxRef.current = null;
			streamRef.current = null;
		};
	}, [stop]);

	return { start, stop, arm };
}
