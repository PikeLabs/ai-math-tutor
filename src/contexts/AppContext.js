import {
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useReducer,
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
	const [answerWindowOpen, setAnswerWindowOpen] = useState(false);

	// Intervention state — SINGLE SOURCE OF TRUTH:
	// 'student_presenting', 'ai_questioning', 'questions_batch_complete', 'final_complete', 'inactive'
	const [interventionState, setInterventionState] = useState(
		INTERVENTION_STATES.inactive
	);
	const [questionsAsked, setQuestionsAsked] = useState(0);
	const questionInFlightRef = useRef(false);
	const [currentSlideRange, setCurrentSlideRange] = useState(null);
	const [qaSlideQueue, setQaSlideQueue] = useState([]); // e.g., [start, start+1]
	const [isCurrentBatchFinal, setIsCurrentBatchFinal] = useState(false);
	const [batchStartIndex, setBatchStartIndex] = useState(0);

	// Slide timestamps
	const [slideTimestamps, setSlideTimestamps] = useState([]);
	const [qaTimestamps, setQaTimestamps] = useState([]);

	const [batchFlags, dispatchFlags] = useReducer(
		(state, action) => {
			switch (action.type) {
				case "RESET_FOR_NEW_BATCH":
					return {
						completing: false,
						awaitingFollowUp: false,
						isFinal: !!action.isFinal,
					};
				case "MARK_COMPLETING":
					return { ...state, completing: true };
				case "ASKED_FOLLOWUP":
					return { ...state, awaitingFollowUp: true };
				case "CONSUME_FOLLOWUP_ANSWER":
					return { ...state, awaitingFollowUp: false };
				case "CLEAR_FINAL_FLAG":
					return { ...state, isFinal: false };
				default:
					return state;
			}
		},
		{
			completing: false,
			awaitingFollowUp: false,
			isFinal: false,
		}
	);

	// Answer-window (countdown) state
	const answerStartRef = useRef(null); // already present (used for QA ranges)
	const answerDefaultSecondsRef = useRef(30); // default countdown per requirement

	// live mirrors to avoid closure staleness during fast transitions
	const qaSlideQueueRef = useRef([]);
	const isCurrentBatchFinalRef = useRef(false);
	const currentSlideRangeRef = useRef(null);
	const interventionRef = useRef(interventionState);
	const questionsAskedRef = useRef(questionsAsked);

	// track live values to avoid stale closures
	const recRef = useRef(isRecording);
	const pausedRef = useRef(isPaused);
	const pausedByAIRef = useRef(false);

	const msgIdRef = useRef(0);

	function pushPendingAssistantMessage() {
		const id = `m_${msgIdRef.current++}`;
		const pending = { id, role: "assistant", content: "", pending: true };
		setMessages((prev) => [...prev, pending]);
		return id;
	}

	function finalizeAssistantMessage(id, content) {
		setMessages((prev) =>
			prev.map((m) => (m.id === id ? { ...m, content, pending: false } : m))
		);
	}

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
				const pendingId = pushPendingAssistantMessage();

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
					finalizeAssistantMessage(pendingId, data.response);
					questionInFlightRef.current = true;
					TTSService.speak(data.response);
				} else {
					finalizeAssistantMessage(pendingId, "...");
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
			if (batchFlags.completing) return;

			// Use a stable snapshot of where we are in the batch before deciding the next action.
			const currentIndex = questionsAskedRef.current ?? 0;

			const slidesTotal = qaSlideQueueRef.current.length;
			const isFinal = !!isCurrentBatchFinalRef.current;
			const totalNeeded = slidesTotal + (isFinal ? 1 : 0);

			if (currentIndex < slidesTotal - 1) {
				// We have more slide questions to ask.
				const nextIndex = currentIndex + 1;
				const nextSlide = qaSlideQueueRef.current[nextIndex];

				try {
					// Commit the increment *now* that we've decided to ask.
					setQuestionsAsked(nextIndex);
					questionsAskedRef.current = nextIndex;
					await askQuestion({
						slideNumber: nextSlide,
						audioSegment: currentRecordingSegment,
					});
				} catch (e) {
					console.error("Failed to generate next slide question:", e);
				}
				return;
			}

			if (isFinal && currentIndex < totalNeeded - 1) {
				try {
					// final follow-up is the last "question" — bump the counter to reflect that we’re asking it
					dispatchFlags({ type: "ASKED_FOLLOWUP" }); // keeps reducer in sync
					const nextIndex = currentIndex + 1;
					setQuestionsAsked(nextIndex);
					questionsAskedRef.current = nextIndex;
					await askQuestion({
						isFollowUp: true,
						audioSegment: currentRecordingSegment,
					});
				} catch (e) {
					console.error("Failed to generate final follow-up:", e);
				}

				return;
			}

			if (batchFlags.awaitingFollowUp) {
				dispatchFlags({ type: "CONSUME_FOLLOWUP_ANSWER" });
			}

			// Otherwise, we’re done with this batch
			dispatchFlags({ type: "MARK_COMPLETING" });
			const nextState = isCurrentBatchFinal
				? INTERVENTION_STATES.final_complete
				: INTERVENTION_STATES.batch_complete;

			if (nextState === INTERVENTION_STATES.batch_complete) {
				setIsCurrentBatchFinal(false);
				dispatchFlags({ type: "CLEAR_FINAL_FLAG" });
			}

			setInterventionState(nextState);

			const vc_continue_response =
				"Please click 'Next' to continue with your presentation.";
			const vc_completion_response =
				"Thanks for those answers! Your feedback is being generated now.";

			const vc_response = isCurrentBatchFinal
				? vc_completion_response
				: vc_continue_response;

			const pendingId = pushPendingAssistantMessage();
			finalizeAssistantMessage(pendingId, vc_response);
			TTSService.speak(vc_response);
		},
		[askQuestion, currentRecordingSegment, batchFlags, isCurrentBatchFinal]
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
			setAnswerWindowOpen(true);
		},
		[recordingTime]
	);

	const endAnswerWindow = useCallback(async () => {
		// Idempotent: only allow once while the window is open
		if (!answerWindowOpen) return;
		setAnswerWindowOpen(false);

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

		console.debug("[AnswerWindow] advancing decision…");
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
		answerWindowOpen,
	]);

	const getLatestRecording = useCallback(() => {
		return new Promise((resolve) => {
			if (!mediaRecorder || (!isRecording && !isPaused)) {
				resolve(currentRecordingSegment);
				return;
			}

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
			dispatchFlags({ type: "RESET_FOR_NEW_BATCH", isFinal: isLastBatch });
			setQuestionsAsked(0);
			questionsAskedRef.current = 0;
			setCurrentSlideRange(slideRange);
			setBatchStartIndex(messages.length);
			setIsCurrentBatchFinal(!!isLastBatch);

			// Trigger AI intervention with context and recording
			await handleAIIntervention(slideRange);
		},
		[
			handleAIIntervention,
			isPaused,
			isRecording,
			pauseRecording,
			messages.length,
		]
	);

	// Handle slide lock triggering recording pause
	const handleSlideAdvance = useCallback(() => {
		// Called when user advances slides after auto-unlock
		if (interventionState === INTERVENTION_STATES.batch_complete && isPaused) {
			// Reset intervention state and resume recording
			setInterventionState(INTERVENTION_STATES.presenting);
			setQuestionsAsked(0);
			setCurrentSlideRange(null);
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

	useEffect(() => {
		qaSlideQueueRef.current = qaSlideQueue;
	}, [qaSlideQueue]);

	useEffect(() => {
		isCurrentBatchFinalRef.current = isCurrentBatchFinal;
	}, [isCurrentBatchFinal]);

	useEffect(() => {
		currentSlideRangeRef.current = currentSlideRange;
	}, [currentSlideRange]);

	useEffect(() => {
		questionsAskedRef.current = questionsAsked;
	}, [questionsAsked]);

	// Centralized TTS → pause/resume
	// TTS listener: when VC stops speaking, resume + arm the VAD
	useEffect(() => {
		const onTTS = (state) => {
			if (state?.isSpeaking) {
				if (recRef.current && !pausedRef.current) {
					pauseRecording?.();
				}
				pausedByAIRef.current = true;
				return;
			}

			// Only open the answer window when a *question's* speech just ended.
			if (
				pausedByAIRef.current &&
				recRef.current &&
				questionInFlightRef.current
			) {
				pausedByAIRef.current = false;
				questionInFlightRef.current = false; // consume the in-flight question

				if (interventionRef.current === INTERVENTION_STATES.questioning) {
					resumeRecording?.();
					startAnswerWindow();
				}
			}
		};

		TTSService.addListener(onTTS);
		return () => TTSService.removeListener(onTTS);
	}, [pauseRecording, resumeRecording, startAnswerWindow]);

	const value = useMemo(
		() => ({
			answerActive,
			answerSecondsDefault: answerDefaultSecondsRef.current,
			batchStartIndex,
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
			setInterventionState,
			setSlideTimestamps,
			slideTimestamps,
			startRecording,
		}),
		[
			answerActive,
			batchStartIndex,
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
