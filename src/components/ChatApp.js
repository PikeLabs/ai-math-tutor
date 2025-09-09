import { useState, useEffect, useCallback, useRef } from "react";

import TTSService from "../TTSService";
import Avatar from "../Avatar";
import { useSession } from "../hooks/useSession";
import { useAppContext } from "../hooks/useAppContext";
import { generateFeedbackMultipart } from "../services/api";
import { INTERVENTION_STATES } from "../constants";

function IncomingChatMessages({
	messages,
	isLoading,
	interventionState,
	feedbackGenerated,
	batchStartIndex = 0,
}) {
	const listRef = useRef(null);

	let messageContent = null;
	let isLoadingContent = null;

	const vcIsQuestioning = interventionState === INTERVENTION_STATES.questioning;
	const questionBatchIsComplete =
		interventionState === INTERVENTION_STATES.batch_complete;
	const isFinalComplete =
		interventionState === INTERVENTION_STATES.final_complete;
	const studentPresenting =
		interventionState === INTERVENTION_STATES.presenting;

	if (messages && messages.length) {
		const sinceBatch = messages.slice(Math.max(0, batchStartIndex));
		let n = 0;

		if (vcIsQuestioning) {
			// show everything since this batch began (includes pending spinner rows)
			n = sinceBatch.length;
		} else if (questionBatchIsComplete) {
			// show all content from this batch including 'thanks...' line;
			n = sinceBatch.length;
		} else if (isFinalComplete && !feedbackGenerated) {
			n = Math.min(1, sinceBatch.length);
		}

		const messagesToShow =
			n > 0 && !studentPresenting ? sinceBatch.slice(-n) : [];

		messageContent = messagesToShow.map(
			({ role, content, pending, id }, index) => {
				if (pending) {
					return (
						<div
							key={id}
							className="mt-2 flex items-center gap-2 pl-10"
						>
							{" "}
							<div className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
							<span className="text-sm text-gray-500">Preparing question…</span>
						</div>
					);
				}

				return (
					<div
						key={id}
						className={`message ${role}`}
					>
						<div className="message-content">{content}</div>
					</div>
				);
			}
		);
	}

	useEffect(() => {
		const rafId = requestAnimationFrame(() => {
			const el = listRef.current;
			if (el) el.scrollTop = el.scrollHeight;
		});

		return () => cancelAnimationFrame(rafId);
	}, [messages?.length, interventionState]);

	if (isLoading) {
		isLoadingContent = (
			<div className="message assistant">
				<div className="message-content">Thinking...</div>
			</div>
		);
	}

	return (
		<div className="min-h-0">
			<div
				ref={listRef}
				className="flex-1 p-5 overflow-y-auto flex flex-col gap-[15px] min-h-0 "
			>
				{messageContent}
				{isLoadingContent}
			</div>
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

function VcChatContainer({
	feedbackGenerated,
	genError,
	interventionState,
	isLoading,
	isSpeaking,
	messages,
	questionsAsked,
	questionsTarget,
	stopCurrentAudio,
	batchStartIndex,
}) {
	let vcDisplay = null;
	const vcIsQuestioning = interventionState === INTERVENTION_STATES.questioning;

	if (vcIsQuestioning) {
		const totalQuestions = questionsTarget || 2;
		const vcQuestionsText = `VC Questions (${questionsAsked}/${totalQuestions})`;

		vcDisplay = (
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

	return (
		<div className="chat-container">
			<div className="chat-header">
				<h1>VC Mentor</h1>
			</div>

			{vcDisplay}

			<GeneratedFeedback
				interventionState={interventionState}
				feedbackGenerated={feedbackGenerated}
				isLoading={isLoading}
				genError={genError}
			/>

			<IncomingChatMessages
				batchStartIndex={batchStartIndex}
				messages={messages}
				isLoading={isLoading}
				interventionState={interventionState}
				questionsAsked={questionsAsked}
				questionsTarget={questionsTarget}
				feedbackGenerated={feedbackGenerated}
			/>
		</div>
	);
}

export default function ChatApp() {
	const { sessionId } = useSession();
	const {
		batchStartIndex,
		getLatestRecording,
		interventionState,
		messages,
		qaTimestamps,
		questionsAsked,
		selectedAssignment,
		setInterventionState,
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
			const payloadToStore = data?.structured || data;

			if (
				payloadToStore?.session_id ||
				payloadToStore?.slides ||
				payloadToStore?.feedback ||
				payloadToStore?.qa_feedback
			) {
				// setPitchFeedback(payloadToStore);
				setFeedbackGenerated(true);
				setInterventionState(INTERVENTION_STATES.inactive);
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
		setInterventionState,
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

	// reset feedback-related flags when the session changes
	useEffect(() => {
		setHasTriggeredFeedback(false);
		setFeedbackGenerated(false);
		setGenError(null);
	}, [sessionId]);

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

			<VcChatContainer
				feedbackGenerated={feedbackGenerated}
				batchStartIndex={batchStartIndex}
				genError={genError}
				interventionState={interventionState}
				isLoading={isLoading}
				isSpeaking={avatarState.isSpeaking}
				messages={messages}
				questionsAsked={questionsAsked}
				questionsTarget={questionsTarget}
				stopCurrentAudio={stopCurrentAudio}
			/>
		</div>
	);
}
