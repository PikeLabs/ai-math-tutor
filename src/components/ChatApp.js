import { useState, useEffect } from "react";

import TTSService from "../TTSService";
import Avatar from "../Avatar";
import { useSession } from "../contexts/SessionContext";
import { useAppContext } from "../contexts/AppContext";
import { generateFeedbackMultipart } from "../services/api";

function IncomingChatMessages({ messages, isLoading }) {
	let messageContent = null;
	let isLoadingContent = null;

	if (messages && messages.length) {
		// TODO: We shouldn't be having roles in the messages anymore...
		messageContent = messages.map(({ role, content }, index) => (
			<div
				key={index + content}
				className={`message ${role}`}
			>
				<div className="message-content">{content}</div>
			</div>
		));
	}

	if (isLoading) {
		isLoadingContent = (
			<div className="message assistant">
				<div className="message-content">Thinking...</div>
			</div>
		);
	}

	return (
		<div className="chat-messages">
			{messageContent}
			{isLoadingContent}
		</div>
	);
}

// TODO: Better name for this component
function OnGoingQuestionsDisplay({
	isSpeaking,
	interventionState,
	questionsAsked,
	stopCurrentAudio,
}) {
	if (interventionState !== "questioning") return null;

	return (
		<div className="intervention-status">
			<span className="intervention-indicator">💬</span>
			<span className="intervention-text">
				VC Questions ({questionsAsked}/2)
			</span>

			<button
				onClick={stopCurrentAudio}
				disabled={!isSpeaking}
				className="stop-speech-btn ml-auto"
				title="Stop speech"
			>
				🔇
			</button>
		</div>
	);
}

// TODO: Better name for this component
function QuestionsCompleted({
	interventionState,
	feedbackGenerated,
	isLoading,
	generateFeedback,
}) {
	if (interventionState !== "complete") return null;

	// TODO: The generate feedback button is going to be removed...
	const genFeedbackButtonText = isLoading
		? "Generating..."
		: "Generate Feedback";
	const genFeedbackButton = (
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
			{genFeedbackButtonText}
		</button>
	);

	// TODO: Is this suppose to link to /feedback?
	const feedbackNotice = (
		<span className="ml-2.5 text-sm text-green-600 font-medium">
			Feedback ready at /feedback
		</span>
	);

	const feedback = feedbackGenerated ? feedbackNotice : genFeedbackButton;

	return (
		<div className="intervention-status complete">
			<span className="intervention-indicator">✅</span>
			<span className="intervention-text">
				Questions Complete - Continue Presentation
			</span>
			{feedback}
		</div>
	);
}

export default function ChatApp() {
	const { sessionId } = useSession();
	const {
		getLatestRecording,
		interventionState,
		messages,
		questionsAsked,
		selectedAssignment,
		slideTimestamps,
	} = useAppContext();

	const [isLoading, setIsLoading] = useState(false);
	const [avatarState, setAvatarState] = useState({
		isLoading: false,
		isSpeaking: false,
	});

	const [feedbackGenerated, setFeedbackGenerated] = useState(false);

	// Keep ChatApp in sync with the TTS engine.
	// Subscribes to TTSService and updates avatarState whenever the VC starts/stops speaking or is loading audio.
	useEffect(() => {
		const handleTTSStateChange = (state) => setAvatarState(state);
		TTSService.addListener(handleTTSStateChange);
		return () => TTSService.removeListener(handleTTSStateChange);
	}, []);

	const stopCurrentAudio = () => {
		TTSService.stop();
	};

	const generateFeedback = async () => {
		setIsLoading(true);

		try {
			// ensure we have the latest audio by stopping now
			const recordingBlob = await getLatestRecording();

			if (!recordingBlob) {
				alert("No recording available. Please record before finishing.");
				return;
			}

			const pdfSessionId = localStorage.getItem("currentPDFSession");
			const pdfSlideCount = localStorage.getItem("currentPDFSlideCount");

			// Send with recording as multipart form data
			const formData = new FormData();
			formData.append("messages", JSON.stringify(messages));
			formData.append("selectedAssignment", selectedAssignment || "");
			formData.append("recording", recordingBlob, "presentation.wav");
			formData.append("slideTimestamps", JSON.stringify(slideTimestamps));
			formData.append("pdfSessionId", pdfSessionId || "");
			formData.append("pdfSlideCount", pdfSlideCount || "");
			formData.append("sessionId", sessionId);

			const response = await generateFeedbackMultipart(formData);
			const data = await response.json();

			if (data.session_id || data.slides || data.feedback) {
				// New structured format or legacy format
				const feedbackToStore = data.feedback || JSON.stringify(data);
				localStorage.setItem("pitchFeedback", feedbackToStore);
				setFeedbackGenerated(true);
				alert("Feedback generated! Navigate to /feedback to view it.");
			} else {
				alert("Error: No feedback received from server");
			}
		} catch (err) {
			alert(`Error generating feedback: ${err.message}`);
			console.error("Feedback generation failed:", err);
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

					<OnGoingQuestionsDisplay
						isSpeaking={avatarState.isSpeaking}
						interventionState={interventionState}
						questionsAsked={questionsAsked}
						stopCurrentAudio={stopCurrentAudio}
					/>

					<QuestionsCompleted
						interventionState={interventionState}
						feedbackGenerated={feedbackGenerated}
						isLoading={isLoading}
						generateFeedback={generateFeedback}
					/>
				</div>

				<IncomingChatMessages
					messages={messages}
					isLoading={isLoading}
				/>
			</div>
		</div>
	);
}
