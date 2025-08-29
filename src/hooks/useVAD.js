import { useEffect, useRef, useCallback } from "react";

/**
 * useVAD — Voice Activity Detection hook
 *
 * PURPOSE
 * -------
 * Lightweight, client-side end-of-speech detector for microphone input.
 * You feed it a live MediaStream, it samples audio (via WebAudio), and when it
 * observes sustained silence after speech it calls `onSilence()`.
 *
 * LIFECYCLE
 * ---------
 * 1) const { start, stop, arm } = useVAD(options)
 * 2) await start(mediaStream)      // begin monitoring a mic stream
 * 3) arm()                         // (re)start an "answer window" you care about
 * 4) onSilence() fires when silence is detected (subject to options)
 * 5) stop()                        // teardown (disconnect nodes, cancel timers)
 *
 * RETURNED API
 * ------------
 * - start(stream: MediaStream): Promise<void>
 *      Attach to a mic stream and begin polling.
 * - stop(): void
 *      Detach and cleanup (analyser, nodes, timers).
 * - arm(): void
 *      Resets internal timers and primes the detector to look for the next
 *      "end of speech" within the current session (use after TTS finishes).
 *
 * OPTIONS (arguments to useVAD)
 * -----------------------------
 * {
 *   onSilence: () => void
 *     Callback invoked once when sustained silence is detected after speech,
 *     while the detector is armed. Typically you pause recording and advance
 *     your flow here.
 *
 *   shouldCount: () => boolean
 *     A predicate polled before each sample. Return false to temporarily
 *     ignore audio (e.g., while TTS is speaking or you’ve paused recording).
 *     This prevents false positives during VC speech or while paused.
 *
 *   threshold: number (default ~0.03)
 *     Loudness threshold (RMS) to qualify as "voice present". Higher = stricter.
 *     Typical range: 0.02–0.08. If background noise triggers speech, increase.
 *     If it never detects voice, decrease slightly.
 *
 *   silenceMs: number (default ~1500)
 *     How long (in ms) audio must remain *below* the threshold to count as an
 *     "end of speech". Increase to avoid cutting off during short hesitations.
 *     Decrease for snappier turn-taking. Common values: 1200–2500.
 *
 *   pollMs: number (default 100)
 *     Sampling interval in milliseconds. Lower = more responsive but more CPU.
 *     50–100ms is usually a good balance.
 *
 *   calibrationMs: number (default 300)
 *     Brief warm-up period after `arm()` where we measure background RMS to
 *     bias the dynamic threshold. Helps adapt to room noise. 200–600ms works well.
 *
 *   requireFirstSpeech: boolean (default true)
 *     If true, silence won’t end the turn until the hook has first observed
 *     speech above threshold after arm(). This avoids ending on initial quiet
 *     right after resumeRecording().
 *
 *   maxAnswerMs: number (default 45000)
 *     Safety timeout (ms) after arm(). If reached without silence, we invoke
 *     onSilence anyway to prevent hanging forever.
 * }
 *
 * TUNING CHEATSHEET
 * -----------------
 * - Too eager (ends between words)?
 *     ↑ silenceMs  (e.g., 2000)
 *     ↑ threshold  (e.g., 0.04)
 * - Never ends?
 *     ↓ threshold  (e.g., 0.025)
 *     ↓ silenceMs  (e.g., 1200–1500)
 * - Ends instantly after resume?
 *     requireFirstSpeech: true
 *     ↑ calibrationMs a little (300–500)
 *
 * COMMON PATTERN
 * --------------
 * // in your TTS "finished" handler:
 * resumeRecording();
 * arm();                 // start "answer window"
 *
 * // in your onSilence:
 * pauseRecording();
 * // ... process the user's answer, then queue the next question ...
 *
 * NOTES
 * -----
 * - This is an amplitude-based heuristic; it won’t transcribe or understand speech.
 * - Works best with headset/close mics; noisy rooms may need higher thresholds.
 * - Always call `stop()` when you fully end recording to release AudioContext
 *   and avoid background CPU usage.
 */
export function useVAD({
	onSilence,
	shouldCount,
	silenceMs = 2000,
	threshold = 0.04,
	calibrationMs = 400,
	pollMs = 100, // (kept for compatibility; not used with rAF here)
	maxAnswerMs = 45000,
	requireFirstSpeech = true,
}) {
	const heardSpeechRef = useRef(false);
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
			heardSpeechRef.current = true;
			lastAboveRef.current = now;
		} else {
			const belowFor = now - lastAboveRef.current;
			if (
				belowFor >= silenceMs &&
				(!requireFirstSpeech || heardSpeechRef.current)
			) {
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
	}, [silenceMs, threshold, maxAnswerMs, requireFirstSpeech]);

	const arm = useCallback(() => {
		armedRef.current = false; // disarm until calibration completes
		calibratingRef.current = true;
		heardSpeechRef.current = false;
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
