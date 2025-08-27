import React, {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import TTSService from "../TTSService";

import {
	createChat,
	createFormChat,
	postAssignmentSlides,
} from "../services/api";

export const AppContext = createContext(null);
export const useAppContext = () => useContext(AppContext);

export function AppProvider({ children, sessionId }) {

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

	// —— Recording controls ————————————————————————————————
	const startRecording = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

			// console.log("Recording started");
		} catch (err) {
			alert("Error accessing microphone: " + err.message);
		}
	};

	const stopRecording = () => {
		if (mediaRecorder && (isRecording || isPaused)) {
			mediaRecorder.stop();
			setIsRecording(false);
			setIsPaused(false);
			setMediaRecorder(null);

			if (recordingTimer) {
				clearInterval(recordingTimer);
				setRecordingTimer(null);
			}
			// console.log("Recording stopped");
		}
	};

	const getLatestRecording = () =>
		new Promise((resolve) => {
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

	const pauseRecording = () => {
		if (isRecording && mediaRecorder && mediaRecorder.state === "recording") {
			mediaRecorder.pause();
			setIsPaused(true);
			if (recordingTimer) {
				clearInterval(recordingTimer);
				setRecordingTimer(null);
			}
			// console.log("Recording paused");
		}
	};

	const resumeRecording = () => {
		if (isPaused && mediaRecorder && mediaRecorder.state === "paused") {
			mediaRecorder.resume();
			setIsPaused(false);
			const timer = setInterval(
				() => setRecordingTime((prev) => prev + 1),
				1000
			);
			setRecordingTimer(timer);
			// console.log("Recording resumed");
		}
	};

	// // Handle slide lock triggering recording pause
	const handleSlideLockTriggered = (slideNumber, recordingBlob = null) => {
		// Use provided recording blob or fallback to current recording segment
		const audioData = recordingBlob || currentRecordingSegment;

		// Only pause if we don't have a recording blob (meaning recording wasn't already stopped)
		if (!recordingBlob && isRecording && !isPaused) {
			pauseRecording();
		}

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
		handleAIIntervention(slideRange, audioData);
	};

	const calculatePresentedSlideRange = (lockSlide) => {
		// Lock triggers when trying to advance FROM the lock slide
		// So if locked at slide 2, they just presented slides 1-2
		// If locked at slide 4, they just presented slides 3-4, etc.
		const end = lockSlide;
		const start = lockSlide === 2 ? 1 : lockSlide - 1; // First range is 1-2, then 3-4, 5-6, etc.

		return { start, end };
	};

	const handleAIIntervention = async (slideRange, audioSegment) => {
		try {
			console.log(
				`AI Intervention triggered for slides ${slideRange.start}-${slideRange.end}`
			);

			if (!selectedAssignment) {
				console.error("No assignment selected for AI intervention");
				return;
			}

			// Extract slide content for the specific range
			// const slideResponse = await fetch(
			// 	`http://localhost:5001/api/assignments/${selectedAssignment}/slides`,
			// 	{
			// 		method: "POST",
			// 		headers: {
			// 			"Content-Type": "application/json",
			// 		},
			// 		body: JSON.stringify({
			// 			start_slide: slideRange.start,
			// 			end_slide: slideRange.end,
			// 		}),
			// 	}
			// );

			const slideResponse = await postAssignmentSlides(
				selectedAssignment,
				sessionId || "",
				slideRange
			);

			if (!slideResponse.ok) {
				throw new Error("Failed to fetch slide content");
			}

			const slideData = await slideResponse.json();
			console.log("Extracted slide content:", slideData);

			// Build enhanced context and send to AI
			await generateVCQuestion(slideData, slideRange, audioSegment);
		} catch (error) {
			console.error("AI Intervention failed:", error);
		}
	};

	const generateVCQuestion = async (slideData, slideRange, audioSegment) => {
		try {
			console.log("🎯 Generating VC Question...");
			console.log("🎵 Audio segment received:", audioSegment);
			console.log("📊 Audio segment type:", audioSegment?.constructor?.name);
			console.log("📏 Audio segment size:", audioSegment?.size, "bytes");

			// Build the enhanced context message with our existing VC prompt structure
			const contextMessage = buildEnhancedContext(
				slideData,
				slideRange,
				audioSegment,
				1
			);

			// Create a temporary message list with just this intervention
			const interventionMessages = [{ role: "user", content: contextMessage }];

			let response;

			// If we have an audio segment, send as multipart form data
			if (audioSegment && audioSegment instanceof Blob) {
				console.log("🚀 Sending audio data to backend as multipart form...");
				const formData = new FormData();
				formData.append("messages", JSON.stringify(interventionMessages));
				formData.append("selectedAssignment", selectedAssignment);
				formData.append("audio", audioSegment, "recording.wav");
				formData.append("sessionId", sessionId || ""); // Include session ID if available
				formData.append("slideNumber", String(slideRange?.end || ""));

				response = await createFormChat(formData);
				// response = await fetch("http://localhost:5001/api/chat", {
				// 	method: "POST",
				// 	body: formData,
				// });
			} else {
				console.log("⚠️ No audio segment found, sending without audio...");
				// Send regular JSON request without audio
				// response = await fetch("http://localhost:5001/api/chat", {
				// 	method: "POST",
				// 	headers: {
				// 		"Content-Type": "application/json",
				// 	},
				// 	body: JSON.stringify({
				// 		messages: interventionMessages,
				// 		selectedAssignment: selectedAssignment,
				// 	}),
				// });
				response = await createChat({
					sessionId,
					messages: interventionMessages,
					selectedAssignment,
					slideNumber: slideRange?.end || "",
				});
			}

			const data = await response.json();

			if (response.ok) {
				// Add the AI's first VC question to the chat automatically
				const aiQuestion = { role: "assistant", content: data.response };
				setMessages((prev) => [...prev, aiQuestion]);

				// Trigger TTS for AI intervention question
				TTSService.speak(data.response);

				// Don't increment questionsAsked here - it gets incremented in handleInterventionResponse
				console.log("AI VC Question 1 generated:", data.response);
			} else {
				console.error("Failed to generate VC question:", data.error);
			}
		} catch (error) {
			console.error("Failed to generate VC question:", error);
		}
	};

	const buildEnhancedContext = (
		slideData,
		slideRange,
		audioSegment,
		questionNumber
	) => {
		// Build the context message that preserves our great VC prompt while adding the new information
		let contextMessage = `CONTEXT FOR THIS INTERVENTION (Question ${questionNumber} of 2):\n`;
		contextMessage += `- Full pitch deck: Available (${selectedAssignment})\n`;
		contextMessage += `- Founder just presented: Slides ${slideRange.start}-${slideRange.end}\n\n`;

		contextMessage += `SLIDES CONTENT:\n${slideData.focused_content}\n\n`;

		if (audioSegment) {
			contextMessage += `FOUNDER'S PRESENTATION: [Audio recorded but not yet transcribed]\n\n`;
		}

		contextMessage += `I just finished presenting slides ${slideRange.start}-${slideRange.end} of my pitch deck. Ask me one specific VC-style question about these slides.`;

		return contextMessage;
	};

	const handleSlideAdvance = () => {
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
	};

	// —— TTS → pause/resume central wiring (no stale closure) ————————————————
	const recRef = useRef(isRecording);
	const pausedRef = useRef(isPaused);
	useEffect(() => {
		recRef.current = isRecording;
	}, [isRecording]);
	useEffect(() => {
		pausedRef.current = isPaused;
	}, [isPaused]);

	useEffect(() => {
		const onTTS = (state) => {
			if (state?.isSpeaking) {
				if (recRef.current && !pausedRef.current) pauseRecording();
			} else {
				if (recRef.current && pausedRef.current) resumeRecording();
			}
		};
		TTSService.addListener(onTTS);
		return () => TTSService.removeListener(onTTS);
		// pauseRecording/resumeRecording are stable as closures to state setters here
	}, []);

	// —— Intervention helpers exposed via context ————————————————
	const buildFollowUpContext = (userResponse, currentSlideRange) =>
		`Based on my previous answer, ask me one final follow-up question about slides ${currentSlideRange.start}-${currentSlideRange.end}. This is question 2 of 2.`;

	const generateFollowUpQuestion = async (userResponse, currentSlideRange) => {
		try {
			const followUpContext = buildFollowUpContext(
				userResponse,
				currentSlideRange
			);
			const conversationMessages = [
				...messages,
				{ role: "user", content: followUpContext },
			];
			const resp = await createChat({
				sessionId,
				messages: conversationMessages,
				selectedAssignment,
			});
			const data = await resp.json();
			if (resp.ok) {
				const followUpQuestion = { role: "assistant", content: data.response };
				setMessages((prev) => [...prev, followUpQuestion]);
				TTSService.speak(data.response);
			} else {
				console.error("Failed to generate follow-up question:", data.error);
			}
		} catch (err) {
			console.error("Failed to generate follow-up question:", err);
		}
	};

	const handleInterventionResponse = async (userMessage, currentSlideRange) => {
		// Called from ChatApp/App when interventionState === "questioning"
		if (interventionState === "questioning" && questionsAsked < 2) {
			if (questionsAsked === 0) {
				setQuestionsAsked(1);
				await generateFollowUpQuestion(userMessage, currentSlideRange);
			} else if (questionsAsked === 1) {
				setQuestionsAsked(2);
				setInterventionState("complete");
				setAutoUnlockReady(true);

				const completionMessage = {
					role: "assistant",
					content:
						"Thanks for those answers! You can continue with your presentation now.",
				};
				setMessages((prev) => [...prev, completionMessage]);
				TTSService.speak(completionMessage.content);
			}
		}
	};

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
		}),
		[
			messages,
			selectedAssignment,
			isRecording,
			isPaused,
			recordingTime,
			currentRecordingSegment,
			interventionState,
			questionsAsked,
			autoUnlockReady,
			slideTimestamps,
			currentSlideRange,
		]
	);

	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
