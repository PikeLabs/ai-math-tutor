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
import { useVAD } from "../hooks/useVAD";

export const AppContext = createContext(null);

export default function AppProvider({ children, sessionId }) {
	// Chat state
	const [messages, setMessages] = useState([]);
	const [selectedAssignment, setSelectedAssignment] = useState("");

	// Recording state
	const [isRecording, setIsRecording] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [mediaRecorder, setMediaRecorder] = useState(null);
	const [recordingTime, setRecordingTime] = useState(0);
	const [recordingTimer, setRecordingTimer] = useState(null);
	const [currentRecordingSegment, setCurrentRecordingSegment] = useState(null);
	// const [audioBlob, setAudioBlob] = useState(null);

	// Intervention state
	const [interventionState, setInterventionState] = useState("inactive"); // 'inactive' | 'questioning' | 'complete'
	const [questionsAsked, setQuestionsAsked] = useState(0);
	const [autoUnlockReady, setAutoUnlockReady] = useState(false);
	const [currentSlideRange, setCurrentSlideRange] = useState(null);

	// Slide timestamps
	const [slideTimestamps, setSlideTimestamps] = useState([]);
	const [qaTimestamps, setQaTimestamps] = useState([]);

	// track live values to avoid stale closures
	const recRef = useRef(isRecording);
	const pausedRef = useRef(isPaused);
	const pausedByAIRef = useRef(false);

	// Track the “answer” window (we only act on VAD when we’re expecting the student to answer)
	const awaitingAnswerRef = useRef(false);
	const answerStartRef = useRef(null);
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
			console.log("Recording paused");
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

	// VAD setup/teardown
	const onUserStoppedTalking = useCallback(async () => {
		if (!awaitingAnswerRef.current) return;
		awaitingAnswerRef.current = false;
		pauseRecording?.();

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
			await handleInterventionResponse("[voice answer]", currentSlideRange);
		} catch (e) {
			console.error("Failed to advance after VAD silence:", e);
		}
	}, [
		pauseRecording,
		handleInterventionResponse,
		currentSlideRange,
		recordingTime,
	]);

	// VAD hook listens to user mic and triggers onSilence when they stop talking
	const {
		start: startVAD,
		stop: stopVAD,
		arm: armVAD,
	} = useVAD({
		onSilence: onUserStoppedTalking,
		// threshold: 0.03, // can tweak 0.02–0.05
		// silenceMs: 1500, // can tweak 1200–2000
		// calibrationMs: 300,
		// pollMs: 100,
		shouldCount: () => recRef.current && !pausedRef.current,
	});

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
			const timer = setInterval(
				() => setRecordingTime((prev) => prev + 1),
				1000
			);
			setRecordingTimer(timer);

			// Start VAD once we have a live mic stream
			await startVAD(stream);
			console.log("Recording started");
		} catch (err) {
			alert("Error accessing microphone: " + err.message);
		}
	}, [startVAD]);

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
			awaitingAnswerRef.current = false;
			pausedByAIRef.current = false;

			stopVAD();
			console.log("Recording stopped");
		}
	}, [mediaRecorder, isRecording, isPaused, recordingTimer, stopVAD]);

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
				stopVAD(); // avoid dangling analyser/timer
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
		stopVAD,
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

				// let response;
				let data;

				// If we have an audio segment, send as multipart form data
				if (audioSegment && audioSegment instanceof Blob) {
					console.log("🚀 Sending audio data to backend as multipart form...");
					const formData = new FormData();
					formData.append("messages", JSON.stringify(interventionMessages));
					formData.append("selectedAssignment", selectedAssignment);
					formData.append("audio", audioSegment, "recording.wav");
					formData.append("sessionId", sessionId || ""); // Include session ID if available
					formData.append("slideNumber", String(slideRange?.end || ""));

					data = await createChatWithAudio(formData);
				} else {
					console.log("⚠️ No audio segment found, sending without audio...");
					data = await createChat({
						sessionId,
						messages: interventionMessages,
						selectedAssignment,
						slideNumber: slideRange?.end || "",
					});
				}

				// const data = await response.json();

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

			// we’re about to have the VC speak, so don’t let VAD think we’re still answering
			awaitingAnswerRef.current = false;

			// Calculate the slide range that was just presented
			const slideRange = calculatePresentedSlideRange(slideNumber);
			console.log(`Recording handled for slide ${slideNumber} lock`);
			console.log(
				`Slide range just presented: ${slideRange.start}-${slideRange.end}`
			);
			console.log(`Audio data provided: ${!!audioData}`);

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
			console.log("Recording resumed after intervention completion");
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

	// Centralized TTS → pause/resume
	// TTS listener: when VC stops speaking, resume + arm the VAD
	useEffect(() => {
		const onTTS = (state) => {
			if (state?.isSpeaking) {
				awaitingAnswerRef.current = false;
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

					awaitingAnswerRef.current = true;
					answerStartRef.current = recordingTime;
					armVAD(); // ← re-arm VAD for this answer window
				}
			}
		};

		TTSService.addListener(onTTS);
		return () => TTSService.removeListener(onTTS);
	}, [pauseRecording, resumeRecording, armVAD, recordingTime]);

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
		]
	);

	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
