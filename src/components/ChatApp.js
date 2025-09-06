import { useState, useEffect } from "react";

import TTSService from "../TTSService";
import Avatar from "../Avatar";
import { useSession } from "../hooks/useSession";
import { useAppContext } from "../hooks/useAppContext";
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
function VcDisplay({
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
function GeneratedFeedback({
	interventionState,
	feedbackGenerated,
	isLoading,
	genError,
}) {
	if (interventionState !== "complete") return null;
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
			<span className="intervention-text">
				Questions Complete — Continue Presentation
			</span>
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
	} = useAppContext();

	const [isLoading, setIsLoading] = useState(false);
	const [avatarState, setAvatarState] = useState({
		isLoading: false,
		isSpeaking: false,
	});
	const [feedbackGenerated, setFeedbackGenerated] = useState(false);
	const [genError, setGenError] = useState(null);
	const [hasTriggeredFeedback, setHasTriggeredFeedback] = useState(false);

	// Keep ChatApp in sync with the TTS engine.
	// Subscribes to TTSService and updates avatarState whenever the VC starts/stops speaking or is loading audio.
	useEffect(() => {
		const handleTTSStateChange = (state) => setAvatarState(state);
		TTSService.addListener(handleTTSStateChange);
		return () => TTSService.removeListener(handleTTSStateChange);
	}, []);

	useEffect(() => {
		if (interventionState === "complete" && !hasTriggeredFeedback) {
			setHasTriggeredFeedback(true);
			generateFeedback();
		}
	}, [interventionState]); // eslint-disable-line react-hooks/exhaustive-deps

	const stopCurrentAudio = () => {
		TTSService.stop();
	};

	const generateFeedback = async () => {
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
