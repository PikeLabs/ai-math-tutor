import { useState, useEffect, useCallback } from "react";

import TTSService from "../TTSService";
import Avatar from "../Avatar";
import { useSession } from "../hooks/useSession";
import { useAppContext } from "../hooks/useAppContext";
import { generateFeedbackMultipart } from "../services/api";
import { INTERVENTION_STATES } from "../constants";

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
function VcDisplay({
	isSpeaking,
	interventionState,
	questionsAsked,
	questionsTarget,
	stopCurrentAudio,
}) {
	if (interventionState !== INTERVENTION_STATES.questioning) return null;
	const total = questionsTarget || 2; // fallback for safety

	const vcQuestionsText = `VC Questions (${questionsAsked}/${total})`;
	return (
		<div className="intervention-status">
			<span className="intervention-indicator">💬</span>
			<span className="intervention-text">{vcQuestionsText}</span>

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
function GeneratedFeedback({
	interventionState,
	feedbackGenerated,
	isLoading,
	genError,
}) {
	// Only render the banner when a presentation has completed...
	if (interventionState !== INTERVENTION_STATES.final_complete) return null;

	let status = null;
	if (isLoading && !feedbackGenerated) {
		return (
			<div className="intervention-status complete complete flex items-center justify-center">
				<span className="ml-2.5 text-md text-gray-500 font-medium">
					Generating feedback...
				</span>
			</div>
		);
	} else if (genError) {
		return (
			<div className="intervention-status complete complete flex items-center justify-center">
				<span className="intervention-indicator mr-2">❌</span>
				<span className="ml-2.5 text-md text-red-600 font-medium">
					Failed to generate feedback...
				</span>
			</div>
		);
	} else if (feedbackGenerated) {
		return (
			<div className="intervention-status complete complete flex items-center justify-center">
				<span className="intervention-indicator mr-2">✅</span>
				<span className="ml-2.5 text-lg text-green-600 font-medium">
					<a
						href="/feedback"
						className="text-green-700 underline hover:no-underline"
					>
						View your feedback
					</a>
				</span>
			</div>
		);
	} else {
		// Edge: complete but not started yet (very brief window)
		status = (
			<span className="ml-2.5 text-md text-blue-600 font-medium">
				Preparing to generate feedback…
			</span>
		);
	}

	return (
		<div className="intervention-status complete">
			<span className="intervention-text">Questions Completed</span>
			{status}
		</div>
	);
}

export default function ChatApp() {
	const { sessionId } = useSession();
	const {
		getLatestRecording,
		interventionState,
		messages,
		qaTimestamps,
		questionsAsked,
		selectedAssignment,
		slideTimestamps,
		questionsTarget,
	} = useAppContext();

	const [isLoading, setIsLoading] = useState(false);
	const [avatarState, setAvatarState] = useState({
		isLoading: false,
		isSpeaking: false,
	});
	const [feedbackGenerated, setFeedbackGenerated] = useState(false);
	const [genError, setGenError] = useState(null);
	const [hasTriggeredFeedback, setHasTriggeredFeedback] = useState(false);

	const generateFeedback = useCallback(async () => {
		setIsLoading(true);
		setGenError(null);

		try {
			// ensure we have the latest audio by stopping now
			const recordingBlob = await getLatestRecording();

			if (
				!recordingBlob ||
				(recordingBlob.size !== undefined && recordingBlob.size === 0)
			) {
				throw new Error("No presentation audio was recorded.");
			}

			// Send with recording as multipart form data
			const formData = new FormData();
			formData.append("messages", JSON.stringify(messages));
			formData.append("selectedAssignment", selectedAssignment || "");
			formData.append("recording", recordingBlob, "presentation.wav");
			formData.append("slideTimestamps", JSON.stringify(slideTimestamps));
			formData.append("qaTimestamps", JSON.stringify(qaTimestamps));
			formData.append("sessionId", sessionId);
			formData.append("pdfSessionId", sessionId);

			const data = await generateFeedbackMultipart(formData);
			console.log("Feedback generation response:", data);
			const payloadToStore = data?.structured || data;

			if (
				payloadToStore?.session_id ||
				payloadToStore?.slides ||
				payloadToStore?.feedback ||
				payloadToStore?.qa_feedback
			) {
				// setPitchFeedback(payloadToStore);
				setFeedbackGenerated(true);
			}
		} catch (err) {
			console.error("Feedback generation failed:", err);
			setGenError("Feedback generation failed");
		} finally {
			setIsLoading(false);
		}
	}, [
		getLatestRecording,
		messages,
		selectedAssignment,
		slideTimestamps,
		qaTimestamps,
		sessionId,
	]);

	// Keep ChatApp in sync with the TTS engine.
	// Subscribes to TTSService and updates avatarState whenever the VC starts/stops speaking or is loading audio.
	useEffect(() => {
		const handleTTSStateChange = (state) => setAvatarState(state);
		TTSService.addListener(handleTTSStateChange);
		return () => TTSService.removeListener(handleTTSStateChange);
	}, []);

	useEffect(() => {
		if (
			interventionState === INTERVENTION_STATES.final_complete &&
			!hasTriggeredFeedback
		) {
			setHasTriggeredFeedback(true);
			generateFeedback();
		}
	}, [interventionState, hasTriggeredFeedback, generateFeedback]);

	const stopCurrentAudio = () => {
		TTSService.stop();
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

					<VcDisplay
						isSpeaking={avatarState.isSpeaking}
						interventionState={interventionState}
						questionsAsked={questionsAsked}
						questionsTarget={questionsTarget}
						stopCurrentAudio={stopCurrentAudio}
					/>

					<GeneratedFeedback
						interventionState={interventionState}
						feedbackGenerated={feedbackGenerated}
						isLoading={isLoading}
						genError={genError}
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
