import React, { useState, useContext, useEffect } from "react";

import { useSession } from "../contexts/SessionContext";
import { createChat, logConversation, saveFeedback } from "../services/api";
import AppContext from "../contexts/AppContext";
import TTSService from "../TTSService";
import Avatar from "../Avatar";

export default function ChatApp() {
	const {
		messages,
		setMessages,
		selectedAssignment,
		setSelectedAssignment,
		isRecording,
		isPaused,
		startRecording,
		stopRecording,
		pauseRecording,
		resumeRecording,
		audioBlob,
		recordingTime,
		formatTime,
		currentRecordingSegment,
		handleInterventionResponse,
		interventionState,
		messages,
		questionsAsked,
		selectedAssignment,
		setMessages,
		slideTimestamps,
	} = useAppContext();
    const { sessionId } = useSession();

	const [inputMessage, setInputMessage] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [avatarState, setAvatarState] = useState({
		isLoading: false,
		isSpeaking: false,
	});
	const [feedbackGenerated, setFeedbackGenerated] = useState(false);

	// Set up TTS service listeners for avatar state
	useEffect(() => {
		const handleTTSStateChange = (state) => {
			console.log("Avatar state update:", state);
			setAvatarState(state);
		};

		TTSService.addListener(handleTTSStateChange);

		return () => {
			TTSService.removeListener(handleTTSStateChange);
			TTSService.stop();
		};
	}, []);

	const stopCurrentAudio = () => {
		TTSService.stop();
	};

	const sendMessage = async () => {
		if (!inputMessage.trim()) return;

		const userMessage = { role: "user", content: inputMessage };
		setMessages((prev) => [...prev, userMessage]);
		const messageContent = inputMessage;
		setInputMessage("");
		console.log("Setting isLoading to true for processing");
		setIsLoading(true);

		try {
			// Check if we're in an intervention and should handle it specially
			if (interventionState === "questioning") {
				await handleInterventionResponse(messageContent);
				setIsLoading(false);
				return;
			}

			// Normal chat flow (when not in intervention)
			// const response = await fetch("http://localhost:5001/api/chat", {
			// 	method: "POST",
			// 	headers: {
			// 		"Content-Type": "application/json",
			// 	},
			// 	body: JSON.stringify({
			// 		messages: [...messages, userMessage],
			// 		selectedAssignment: selectedAssignment,
			// 	}),
			// });
            const response = await createChat({
                sessionId,
                messages: [...messages, userMessage],
                selectedAssignment,
                slideNumber: null,
            });

			const data = await response.json();

			if (response.ok) {
				const aiMessage = { role: "assistant", content: data.response };
				setMessages((prev) => [...prev, aiMessage]);

				// Trigger TTS for AI response
				TTSService.speak(data.response);
			} else {
				const errorMessage = {
					role: "assistant",
					content: `Error: ${data.error}`,
				};
				setMessages((prev) => [...prev, errorMessage]);
			}
		} catch (error) {
			const errorMessage = {
				role: "assistant",
				content: `Error: ${error.message}`,
			};
			setMessages((prev) => [...prev, errorMessage]);
		} finally {
			setIsLoading(false);
		}
	};

	const handleKeyDown = (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	};

	const generateFeedback = async () => {
		if (!messages.length) return;

		setIsLoading(true);
		try {
			// Get the latest recording from the context
			const recordingBlob = currentRecordingSegment;

			// Get PDF session ID and slide count from localStorage
			const pdfSessionId = localStorage.getItem("currentPDFSession");
			const pdfSlideCount = localStorage.getItem("currentPDFSlideCount");
			console.log("📄 Using PDF session ID:", pdfSessionId);
			console.log("📄 Using PDF slide count:", pdfSlideCount);

			if (recordingBlob) {
				// Send with recording as multipart form data
				const formData = new FormData();
				formData.append("messages", JSON.stringify(messages));
				formData.append("selectedAssignment", selectedAssignment || "");
				formData.append("recording", recordingBlob, "presentation.wav");
				formData.append("slideTimestamps", JSON.stringify(slideTimestamps));
				formData.append("pdfSessionId", pdfSessionId || "");
				formData.append("pdfSlideCount", pdfSlideCount || "");

				const response = await fetch("http://localhost:5001/api/feedback", {
					method: "POST",
					body: formData,
				});

				const data = await response.json();

				if (response.ok) {
					console.log("Feedback response:", data);
					if (data.session_id || data.slides || data.feedback) {
						// New structured format or legacy format
						const feedbackToStore = data.feedback || JSON.stringify(data);
						localStorage.setItem("pitchFeedback", feedbackToStore);
						setFeedbackGenerated(true);
						alert("Feedback generated! Navigate to /feedback to view it.");
					} else {
						alert("Error: No feedback received from server");
					}
				} else {
					console.error("Feedback error:", data);
					alert(`Error generating feedback: ${data.error || "Unknown error"}`);
				}
			} else {
				// Send without recording as JSON
				const response = await fetch("http://localhost:5001/api/feedback", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						messages: messages,
						selectedAssignment: selectedAssignment || "",
						pdfSessionId: pdfSessionId || "",
						pdfSlideCount: pdfSlideCount || "",
					}),
				});

				const data = await response.json();

				if (response.ok) {
					console.log("Feedback response (no recording):", data);
					if (data.session_id || data.slides || data.feedback) {
						// New structured format or legacy format
						const feedbackToStore = data.feedback || JSON.stringify(data);
						localStorage.setItem("pitchFeedback", feedbackToStore);
						setFeedbackGenerated(true);
						alert("Feedback generated! Navigate to /feedback to view it.");
					} else {
						alert("Error: No feedback received from server");
					}
				} else {
					console.error("Feedback error (no recording):", data);
					alert(`Error generating feedback: ${data.error || "Unknown error"}`);
				}
			}
		} catch (error) {
			console.error("Feedback generation error:", error);
			alert(`Error generating feedback: ${error.message}`);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="chat-panel-container">
			<Avatar
				isSpeaking={avatarState.isSpeaking}
				isLoading={avatarState.isLoading}
				isProcessing={isLoading}
			/>
			<div className="chat-container">
				<div className="chat-header">
					<h1>VC Mentor</h1>
					{interventionState === "questioning" && (
						<div className="intervention-status">
							<span className="intervention-indicator">💬</span>
							<span className="intervention-text">
								VC Questions ({questionsAsked}/2)
							</span>
						</div>
					)}
					{interventionState === "complete" && (
						<div className="intervention-status complete">
							<span className="intervention-indicator">✅</span>
							<span className="intervention-text">
								Questions Complete - Continue Presentation
							</span>
							{!feedbackGenerated && (
								<button
									onClick={generateFeedback}
									disabled={isLoading}
									className="generate-feedback-btn"
									style={{
										marginLeft: "10px",
										padding: "5px 10px",
										fontSize: "12px",
									}}
								>
									{isLoading ? "Generating..." : "Generate Feedback"}
								</button>
							)}
							{feedbackGenerated && (
								<span
									style={{
										marginLeft: "10px",
										color: "green",
										fontSize: "12px",
									}}
								>
									Feedback ready at /feedback
								</span>
							)}
						</div>
					)}
				</div>

				<div className="chat-messages">
					{messages.map((message, index) => (
						<div
							key={index}
							className={`message ${message.role}`}
						>
							<div className="message-content">{message.content}</div>
						</div>
					))}
					{isLoading && (
						<div className="message assistant">
							<div className="message-content">Thinking...</div>
						</div>
					)}
				</div>

				<div className="chat-input">
					<textarea
						value={inputMessage}
						onChange={(e) => setInputMessage(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Tell me about your startup challenge..."
						disabled={isLoading}
					/>
					<div className="input-controls">
						<button
							onClick={sendMessage}
							disabled={isLoading || !inputMessage.trim()}
						>
							Send
						</button>
						<button
							onClick={stopCurrentAudio}
							disabled={!avatarState.isSpeaking}
							className="stop-speech-btn"
							title="Stop speech"
						>
							🔇
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
