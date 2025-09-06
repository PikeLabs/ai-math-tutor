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

	// Intervention state
	const [interventionState, setInterventionState] = useState("inactive"); // 'inactive' | 'questioning' | 'complete'
	const [questionsAsked, setQuestionsAsked] = useState(0);
	const [autoUnlockReady, setAutoUnlockReady] = useState(false);
	const [currentSlideRange, setCurrentSlideRange] = useState(null);

	// Slide timestamps
	const [slideTimestamps, setSlideTimestamps] = useState([]);
	const [qaTimestamps, setQaTimestamps] = useState([]);

	// Answer-window (countdown) state
	const answerStartRef = useRef(null); // already present (used for QA ranges)
	const answerDefaultSecondsRef = useRef(30); // default countdown per requirement
	// (Optional) sequence id if we ever need to force re-start logic in the UI
	const answerWindowSeqRef = useRef(0);

	// track live values to avoid stale closures
	const recRef = useRef(isRecording);
	const pausedRef = useRef(isPaused);
	const pausedByAIRef = useRef(false);

	// Track the “answer” window (only when we’re expecting the student to answer)
	const interventionRef = useRef(interventionState);

	const generateFollowUpQuestion = useCallback(
		async (userResponse, currentSlideRange) => {
			try {
				const followUpContext = buildFollowUpContext(
					userResponse,
					currentSlideRange
				);

				const conversationMessages = [
					...messages,
					{ role: "user", content: followUpContext },
				];

				const data = await createChat({
					sessionId,
					messages: conversationMessages,
					selectedAssignment,
				});

				if (data?.response) {
					const followUpQuestion = {
						role: "assistant",
						content: data.response,
					};

					setMessages((prev) => [...prev, followUpQuestion]);
					TTSService.speak(data.response);
				}
			} catch (err) {
				console.error("Failed to generate follow-up question:", err);
			}
		},
		[messages, sessionId, selectedAssignment]
	);

	const handleInterventionResponse = useCallback(
		async (userMessage, currentSlideRange) => {
			// Called from ChatApp/App when interventionState === "questioning"
			if (interventionState === "questioning" && questionsAsked < 2) {
				if (questionsAsked === 0) {
					setQuestionsAsked(1);
					await generateFollowUpQuestion(userMessage, currentSlideRange);
				} else if (questionsAsked === 1) {
					setQuestionsAsked(2);
					setInterventionState("complete");
					setAutoUnlockReady(true);

					// TODO: Should we have a diff message for the end?
					const vc_completion_response =
						"Thanks for those answers! Your feedback is being generated now.";
					// const vc_completion_response =
					// 	"Thanks for those answers! You can continue with your presentation now.";
					const completionMessage = {
						role: "assistant",
						content: vc_completion_response,
					};
					setMessages((prev) => [...prev, completionMessage]);
					TTSService.speak(completionMessage.content);
				}
			}
		},
		[interventionState, questionsAsked, generateFollowUpQuestion]
	);

	// —— Recording controls ————————————————————————————————
	const pauseRecording = useCallback(() => {
		console.log(
			"[pause] state:",
			mediaRecorder?.state,
			"isRecording:",
			isRecording
		);
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
	}, [isRecording, mediaRecorder, recordingTimer]);

	const resumeRecording = useCallback(() => {
		console.log("[resume] state:", mediaRecorder?.state, "isPaused:", isPaused);
		if (isPaused && mediaRecorder && mediaRecorder.state === "paused") {
			mediaRecorder.resume();
			setIsPaused(false);
			const timer = setInterval(
				() => setRecordingTime((prev) => prev + 1),
				1000
			);
			setRecordingTimer(timer);
			console.log("Recording resumed");
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
			answerWindowSeqRef.current += 1;
		},
		[recordingTime]
	);

	const endAnswerWindow = useCallback(
		async (reason = "continue") => {
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
		},
		[
			answerActive,
			pauseRecording,
			handleInterventionResponse,
			currentSlideRange,
			recordingTime,
		]
	);

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

	const generateVCQuestion = useCallback(
		async (slideData, slideRange, audioSegment) => {
			try {
				// Build the enhanced context message with our existing VC prompt structure
				const contextMessage = buildEnhancedContext(
					slideData,
					slideRange,
					audioSegment,
					1,
					selectedAssignment
				);

				// Create a temporary message list with just this intervention
				const interventionMessages = [
					{ role: "user", content: contextMessage },
				];

				let data;

				// If we have an audio segment, send as multipart form data
				if (audioSegment && audioSegment instanceof Blob) {
					const formData = new FormData();
					formData.append("messages", JSON.stringify(interventionMessages));
					formData.append("selectedAssignment", selectedAssignment);
					formData.append("audio", audioSegment, "recording.wav");
					formData.append("sessionId", sessionId || ""); // Include session ID if available
					formData.append("slideNumber", String(slideRange?.end || ""));

					data = await createChatWithAudio(formData);
				} else {
					data = await createChat({
						sessionId,
						messages: interventionMessages,
						selectedAssignment,
						slideNumber: slideRange?.end || "",
					});
				}

				if (data?.response) {
					// Add the AI's first VC question to the chat automatically
					const aiQuestion = { role: "assistant", content: data.response };
					setMessages((prev) => [...prev, aiQuestion]);

					// Trigger TTS for AI intervention question
					TTSService.speak(data.response);

					// Don't increment questionsAsked here - it gets incremented in handleInterventionResponse
					console.log("AI VC Question 1 generated:", data.response);
				}
			} catch (error) {
				console.error("Failed to generate VC question:", error);
			}
		},
		[selectedAssignment, sessionId]
	);

	const handleAIIntervention = useCallback(
		async (slideRange, audioSegment) => {
			try {
				console.log(
					`AI Intervention triggered for slides ${slideRange.start}-${slideRange.end}`
				);

				if (!selectedAssignment) {
					console.error("No assignment selected for AI intervention");
					return;
				}

				const slideData = await postAssignmentSlides(
					selectedAssignment,
					slideRange
				);

				console.log("Extracted slide content:", slideData);

				// Build enhanced context and send to AI
				await generateVCQuestion(slideData, slideRange, audioSegment);
			} catch (error) {
				console.error("AI Intervention failed:", error);
			}
		},
		[generateVCQuestion, selectedAssignment]
	);

	const handleSlideLockTriggered = useCallback(
		async (slideNumber, recordingBlob = null) => {
			// Use provided recording blob or fallback to current recording segment
			const audioData = recordingBlob || currentRecordingSegment;

			// Only pause if we don't have a recording blob (meaning recording wasn't already stopped)
			if (!recordingBlob && isRecording && !isPaused) {
				pauseRecording();
			}

			// Calculate the slide range that was just presented
			const slideRange = calculatePresentedSlideRange(slideNumber);

			// Start intervention session
			setInterventionState("questioning");
			setQuestionsAsked(0);
			setCurrentSlideRange(slideRange);
			setAutoUnlockReady(false);

			// Trigger AI intervention with context and recording
			await handleAIIntervention(slideRange, audioData);
		},
		[
			currentRecordingSegment,
			handleAIIntervention,
			isPaused,
			isRecording,
			pauseRecording,
		]
	);

	// Handle slide lock triggering recording pause
	const handleSlideAdvance = useCallback(() => {
		// Called when user advances slides after auto-unlock
		if (interventionState === "complete" && isPaused) {
			// Reset intervention state and resume recording
			setInterventionState("inactive");
			setQuestionsAsked(0);
			setCurrentSlideRange(null);
			setAutoUnlockReady(false);

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
				if (interventionRef.current === "questioning") {
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
			// chat
			messages,
			setMessages,
			selectedAssignment,
			setSelectedAssignment,

			// recording
			isRecording,
			isPaused,
			startRecording,
			stopRecording,
			pauseRecording,
			resumeRecording,
			recordingTime,
			currentRecordingSegment,
			getLatestRecording,

			// intervention
			interventionState,
			setInterventionState,
			questionsAsked,
			setQuestionsAsked,
			autoUnlockReady,
			setAutoUnlockReady,
			currentSlideRange,
			handleInterventionResponse,

			// slide flow handlers
			handleSlideLockTriggered,
			handleSlideAdvance,
			setCurrentSlideRange,

			// timestamps
			slideTimestamps,
			setSlideTimestamps,
			qaTimestamps,
			setQaTimestamps,

			// answer window
			answerActive,
			startAnswerWindow,
			endAnswerWindow,
			answerSecondsDefault: answerDefaultSecondsRef.current,
		}),
		[
			// chat
			messages,
			selectedAssignment,

			// recording
			isRecording,
			isPaused,
			startRecording,
			stopRecording,
			pauseRecording,
			resumeRecording,
			recordingTime,
			currentRecordingSegment,
			getLatestRecording,

			// intervention
			interventionState,
			questionsAsked,
			autoUnlockReady,
			currentSlideRange,
			handleInterventionResponse,

			// slide flow handlers
			handleSlideLockTriggered,
			handleSlideAdvance,

			// timestamps
			slideTimestamps,
			qaTimestamps,

			// answer window
			answerActive,
			startAnswerWindow,
			endAnswerWindow,
		]
	);

	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
