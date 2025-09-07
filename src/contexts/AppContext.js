import {
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import TTSService from "../TTSService";
import {
	createChat,
	createChatWithAudio,
	postAssignmentSlides,
} from "../services/api";
import {
	buildEnhancedContext,
	calculatePresentedSlideRange,
	buildFollowUpContext,
} from "../utils";
import { INTERVENTION_STATES } from "../constants";

export const AppContext = createContext(null);

const MAX_PRESENTATION_SECONDS = 10 * 60; // 10 minutes safeguard

export default function AppProvider({ children, sessionId }) {
	// Chat state
	const [messages, setMessages] = useState([]);
	const [selectedAssignment, setSelectedAssignment] = useState("");

	// Recording state
	const [answerActive, setAnswerActive] = useState(false); // UI listens to this
	const [isRecording, setIsRecording] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [mediaRecorder, setMediaRecorder] = useState(null);
	const [recordingTime, setRecordingTime] = useState(0);
	const [recordingTimer, setRecordingTimer] = useState(null);
	const [currentRecordingSegment, setCurrentRecordingSegment] = useState(null);

	// Intervention state — SINGLE SOURCE OF TRUTH:
	// 'student_presenting', 'ai_questioning', 'questions_batch_complete', 'final_complete', 'inactive'
	const [interventionState, setInterventionState] = useState(
		INTERVENTION_STATES.inactive
	);
	const [questionsAsked, setQuestionsAsked] = useState(0);
	const [currentSlideRange, setCurrentSlideRange] = useState(null);
	const [qaSlideQueue, setQaSlideQueue] = useState([]); // e.g., [start, start+1]
	const [isCurrentBatchFinal, setIsCurrentBatchFinal] = useState(false);

	// Slide timestamps
	const [slideTimestamps, setSlideTimestamps] = useState([]);
	const [qaTimestamps, setQaTimestamps] = useState([]);

	// Answer-window (countdown) state
	const answerStartRef = useRef(null); // already present (used for QA ranges)
	const answerDefaultSecondsRef = useRef(30); // default countdown per requirement
	const answerWindowOpenRef = useRef(false); // true between startAnswerWindow -> endAnswerWindow
	const completingBatchRef = useRef(false); // true once we start completing a batch to avoid double-complete
	const followUpAskedRef = useRef(false);

	// track live values to avoid stale closures
	const recRef = useRef(isRecording);
	const pausedRef = useRef(isPaused);
	const pausedByAIRef = useRef(false);

	// Track the “answer” window (only when we’re expecting the student to answer)
	const interventionRef = useRef(interventionState);

	const askQuestion = useCallback(
		async ({ slideNumber = null, isFollowUp = false, audioSegment = null }) => {
			try {
				if (!selectedAssignment) return;

				let interventionMessages;
				let slideNumberForPayload = undefined;

				if (isFollowUp) {
					if (!currentSlideRange) return;
					const followUpPrompt = buildFollowUpContext(currentSlideRange);
					interventionMessages = [{ role: "user", content: followUpPrompt }];
				} else {
					if (!slideNumber) return;

					const slideData = await postAssignmentSlides(selectedAssignment, {
						start: slideNumber,
						end: slideNumber,
					});

					const singleSlideRange = { start: slideNumber, end: slideNumber };
					const contextMessage = buildEnhancedContext(
						slideData,
						singleSlideRange,
						audioSegment,
						1,
						selectedAssignment
					);

					interventionMessages = [{ role: "user", content: contextMessage }];
					slideNumberForPayload = String(slideNumber);
				}

				let data;
				if (audioSegment && audioSegment instanceof Blob) {
					const formData = new FormData();
					formData.append("messages", JSON.stringify(interventionMessages));
					formData.append("selectedAssignment", selectedAssignment);
					formData.append("audio", audioSegment, "recording.wav");
					formData.append("sessionId", sessionId || "");

					if (slideNumberForPayload) {
						formData.append("slideNumber", slideNumberForPayload);
					}
					data = await createChatWithAudio(formData);
				} else {
					data = await createChat({
						sessionId,
						messages: interventionMessages,
						selectedAssignment,
						...(slideNumberForPayload
							? { slideNumber: Number(slideNumberForPayload) }
							: {}),
					});
				}

				if (data?.response) {
					const aiQuestion = { role: "assistant", content: data.response };
					setMessages((prev) => [...prev, aiQuestion]);
					TTSService.speak(data.response);
				}
			} catch (err) {
				const errorMessage = isFollowUp
					? "Failed to generate final follow-up question:"
					: `Failed to generate question for slide ${slideNumber}:`;
				console.error(errorMessage, err);
			}
		},
		[selectedAssignment, sessionId, currentSlideRange]
	);

	const handleInterventionResponse = useCallback(
		async (_userMessage, _currentSlideRange) => {
			// Use the ref to avoid stale-closure races
			if (interventionRef.current !== INTERVENTION_STATES.questioning) return;
			// If we're already completing, ignore duplicate "end" triggers
			if (completingBatchRef.current) return;

			const nextIndex = questionsAsked + 1;
			setQuestionsAsked(nextIndex);

			// If we still have slides left in the batch, ask the next slide's question
			if (nextIndex < qaSlideQueue.length && qaSlideQueue[nextIndex] != null) {
				const nextSlide = qaSlideQueue[nextIndex];
				try {
					// We are NOT completing yet; make sure flag remains false.
					completingBatchRef.current = false;
					await askQuestion({
						slideNumber: nextSlide,
						audioSegment: currentRecordingSegment,
					});
				} catch (e) {
					console.error("Failed to generate next slide question:", e);
				}
				return;
			}

			// If this is the FINAL batch and we've finished all per-slide questions,
			// ask the one final follow-up (counts toward questionsTarget as +1).
			const finishedAllSlideQs = nextIndex === qaSlideQueue.length;
			if (
				isCurrentBatchFinal &&
				finishedAllSlideQs &&
				!followUpAskedRef.current
			) {
				try {
					completingBatchRef.current = false;
					followUpAskedRef.current = true;

					await askQuestion({
						isFollowUp: true,
						audioSegment: currentRecordingSegment,
					});
				} catch (e) {
					console.error("Failed to generate final follow-up:", e);
				}
				return;
			}

			// Otherwise, we’re done with this batch
			completingBatchRef.current = true;
			const nextState = isCurrentBatchFinal
				? INTERVENTION_STATES.final_complete
				: INTERVENTION_STATES.batch_complete;

			setInterventionState(nextState);

			const vc_continue_response =
				"Thanks for those answers! Please click 'Next' to continue with your presentation.";
			const vc_completion_response =
				"Thanks for those answers! Your feedback is being generated now.";

			const vc_response = isCurrentBatchFinal
				? vc_completion_response
				: vc_continue_response;

			const completionMessage = {
				role: "assistant",
				content: vc_response,
			};

			setMessages((prev) => [...prev, completionMessage]);
			TTSService.speak(completionMessage.content);
		},
		[
			questionsAsked,
			askQuestion,
			qaSlideQueue,
			currentRecordingSegment,
			isCurrentBatchFinal,
		]
	);

	// —— Recording controls ————————————————————————————————
	const pauseRecording = useCallback(() => {
		if (mediaRecorder?.state === "recording") {
			mediaRecorder.pause();
			setIsPaused(true);
			if (recordingTimer) {
				clearInterval(recordingTimer);
				setRecordingTimer(null);
			}
		} else {
			// optional debug
			console.log("[pause] skipped — no active recorder");
		}
	}, [mediaRecorder, recordingTimer]);

	const resumeRecording = useCallback(() => {
		if (isPaused && mediaRecorder && mediaRecorder.state === "paused") {
			mediaRecorder.resume();
			setIsPaused(false);
			const timer = setInterval(
				() => setRecordingTime((prev) => prev + 1),
				1000
			);
			setRecordingTimer(timer);
		}
	}, [isPaused, mediaRecorder]);

	const startRecording = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});

			const recorder = new MediaRecorder(stream);
			const audioChunks = [];

			recorder.ondataavailable = (e) => {
				audioChunks.push(e.data);
			};

			recorder.onstop = () => {
				const blob = new Blob(audioChunks, { type: "audio/wav" });
				setCurrentRecordingSegment(blob);
				stream.getTracks().forEach((t) => t.stop());
			};

			recorder.start();
			setMediaRecorder(recorder);
			setIsRecording(true);
			setIsPaused(false);
			setRecordingTime(0);

			// Start timer
			const timer = setInterval(() => {
				setRecordingTime((prev) => prev + 1);
			}, 1000);
			setRecordingTimer(timer);
		} catch (err) {
			alert("Error accessing microphone: " + err.message);
		}
	}, []);

	const stopRecording = useCallback(() => {
		if (mediaRecorder && (isRecording || isPaused)) {
			mediaRecorder.stop();
			setIsRecording(false);
			setIsPaused(false);
			setMediaRecorder(null);

			if (recordingTimer) {
				clearInterval(recordingTimer);
				setRecordingTimer(null);
			}

			// hard reset conversation-side gates
			pausedByAIRef.current = false;
		}
	}, [mediaRecorder, isRecording, isPaused, recordingTimer]);

	// ---- Answer window helpers (countdown UI lives in PDFViewer) ----
	const startAnswerWindow = useCallback(
		(seconds = 30) => {
			// mark the start so we can stamp QA ranges later (based on recordingTime seconds)
			answerStartRef.current = recordingTime;
			answerDefaultSecondsRef.current = seconds;
			setAnswerActive(true);

			// prevents double ending
			answerWindowOpenRef.current = true;
		},
		[recordingTime]
	);

	const endAnswerWindow = useCallback(async () => {
		// Idempotent: only allow once while the window is open
		if (!answerWindowOpenRef.current) return;
		answerWindowOpenRef.current = false;

		if (!answerActive) return;
		setAnswerActive(false);

		// stop the student’s answer segment
		if (recRef.current && !pausedRef.current) {
			pauseRecording?.();
		}

		// stamp QA timestamps using recording-time seconds
		if (answerStartRef.current != null) {
			const start = answerStartRef.current;
			const end = recordingTime;
			if (end > start) {
				setQaTimestamps((prev) => [...prev, { start, end }]);
			}
			answerStartRef.current = null;
		}

		// Advance the intervention flow: ask follow-up (Q2) or finish.
		try {
			await handleInterventionResponse(
				"[voice/timer answer]",
				currentSlideRange
			);
		} catch (e) {
			console.error("Failed to advance after answer window end:", e);
		}
	}, [
		answerActive,
		pauseRecording,
		handleInterventionResponse,
		currentSlideRange,
		recordingTime,
	]);

	const getLatestRecording = useCallback(() => {
		return new Promise((resolve) => {
			if (mediaRecorder && (isRecording || isPaused)) {
				// We need to collect the audio chunks ourselves since we're overriding onstop
				const audioChunks = [];

				// Override the data handler temporarily
				const originalOnData = mediaRecorder.ondataavailable;
				mediaRecorder.ondataavailable = (event) => {
					audioChunks.push(event.data);
					originalOnData && originalOnData(event);
				};

				// Set up a temporary handler for when recording stops
				const originalOnStop = mediaRecorder.onstop;
				mediaRecorder.onstop = (event) => {
					const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
					originalOnStop && originalOnStop(event);
					resolve(audioBlob);
				};

				// Stop the recording
				mediaRecorder.stop();
				setIsRecording(false);
				setIsPaused(false);
				if (recordingTimer) {
					clearInterval(recordingTimer);
					setRecordingTimer(null);
				}
			} else {
				resolve(currentRecordingSegment);
			}
		});
	}, [
		mediaRecorder,
		isRecording,
		isPaused,
		recordingTimer,
		currentRecordingSegment,
	]);

	const handleAIIntervention = useCallback(
		async (slideRange) => {
			try {
				if (!selectedAssignment) {
					return;
				}

				// Build queue for the batch: one question per slide
				const queue = [];
				for (let n = slideRange.start; n <= slideRange.end; n++) {
					queue.push(n);
				}

				setQaSlideQueue(queue);
				setQuestionsAsked(0);

				// Ask the first question for the first slide in the batch
				const first = queue[0];
				await askQuestion({
					slideNumber: first,
					audioSegment: currentRecordingSegment,
				});
			} catch (error) {
				console.error("AI Intervention failed:", error);
			}
		},
		[askQuestion, selectedAssignment, currentRecordingSegment]
	);

	const handleSlideLockTriggered = useCallback(
		async (slideNumber, isLastBatch = false) => {
			// Always pause so nothing leaks into Q&A
			if (isRecording && !isPaused) {
				pauseRecording();
			}

			// Range for the just-presented slides (e.g., 1–2, 3–4, or last single if odd number)
			const slideRange = calculatePresentedSlideRange(slideNumber);

			// if it's the final batch AND the last page number is odd,
			// force a single-slide final batch (one question before feedback).
			if (isLastBatch && slideNumber % 2 === 1) {
				// (no removal; this is an insertion)
				slideRange.start = slideNumber;
				slideRange.end = slideNumber;
			}

			// Start intervention session
			setInterventionState(INTERVENTION_STATES.questioning);
			completingBatchRef.current = false;
			followUpAskedRef.current = false;
			setQuestionsAsked(0);
			setCurrentSlideRange(slideRange);
			// setAutoUnlockReady(false);
			setIsCurrentBatchFinal(!!isLastBatch);

			// Trigger AI intervention with context and recording
			await handleAIIntervention(slideRange);
		},
		[handleAIIntervention, isPaused, isRecording, pauseRecording]
	);

	// Handle slide lock triggering recording pause
	const handleSlideAdvance = useCallback(() => {
		// Called when user advances slides after auto-unlock
		if (interventionState === INTERVENTION_STATES.batch_complete && isPaused) {
			// Reset intervention state and resume recording
			setInterventionState(INTERVENTION_STATES.student_presenting);
			setQuestionsAsked(0);
			setCurrentSlideRange(null);
			// setAutoUnlockReady(false);
			setIsCurrentBatchFinal(false);

			// Resume recording automatically
			resumeRecording();
		}
	}, [interventionState, isPaused, resumeRecording]);

	// keep refs in sync with state
	useEffect(() => {
		interventionRef.current = interventionState;
	}, [interventionState]);

	useEffect(() => {
		recRef.current = isRecording;
	}, [isRecording]);

	useEffect(() => {
		pausedRef.current = isPaused;
	}, [isPaused]);

	// Enforce the presentation max length with fresh references
	useEffect(() => {
		if (isRecording && recordingTime >= MAX_PRESENTATION_SECONDS) {
			stopRecording();
		}
	}, [isRecording, recordingTime, stopRecording]);

	// Centralized TTS → pause/resume
	// TTS listener: when VC stops speaking, resume + arm the VAD
	useEffect(() => {
		const onTTS = (state) => {
			if (state?.isSpeaking) {
				// awaitingAnswerRef.current = false;
				if (recRef.current && !pausedRef.current) {
					pauseRecording?.();
				}
				pausedByAIRef.current = true;
				return;
			}

			if (pausedByAIRef.current && recRef.current) {
				pausedByAIRef.current = false;

				if (interventionRef.current === INTERVENTION_STATES.questioning) {
					resumeRecording?.();
					pausedByAIRef.current = false;
					startAnswerWindow();
				}
			}
		};

		TTSService.addListener(onTTS);
		return () => TTSService.removeListener(onTTS);
	}, [pauseRecording, resumeRecording, recordingTime, startAnswerWindow]);

	const value = useMemo(
		() => ({
			answerActive,
			answerSecondsDefault: answerDefaultSecondsRef.current,
			endAnswerWindow,
			getLatestRecording,
			handleSlideAdvance,
			handleSlideLockTriggered,
			interventionState,
			isPaused,
			isRecording,
			messages,
			qaTimestamps,
			questionsAsked,
			questionsTarget: qaSlideQueue.length + (isCurrentBatchFinal ? 1 : 0),
			recordingTime,
			selectedAssignment,
			setSelectedAssignment,
			setSlideTimestamps,
			slideTimestamps,
			startRecording,
		}),
		[
			answerActive,
			endAnswerWindow,
			getLatestRecording,
			handleSlideAdvance,
			handleSlideLockTriggered,
			interventionState,
			isPaused,
			isRecording,
			messages,
			qaTimestamps,
			questionsAsked,
			qaSlideQueue.length,
			recordingTime,
			selectedAssignment,
			slideTimestamps,
			startRecording,
			isCurrentBatchFinal,
		]
	);

	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
