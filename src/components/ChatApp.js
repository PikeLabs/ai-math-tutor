import {
	useState,
	useEffect,
	useCallback,
	useLayoutEffect,
	useRef,
} from "react";

import TTSService from "../TTSService";
import Avatar from "../Avatar";

import { useSession } from "../hooks/useSession";
import { useAppContext } from "../hooks/useAppContext";
import { useCheckpoint } from "../hooks/useCheckpoint";
import { generateFeedbackMultipart } from "../services/api";
import { INTERVENTION_STATES } from "../constants";

function IncomingChatMessages({
	answerActive,
	batchStartIndex = 0,
	feedbackGenerated,
	interventionState,
	isSpeaking,
	messages,
}) {
	const endRef = useRef(null);
	const didMountRef = useRef(false);

	let messageContent = null;
	const vcIsQuestioning = interventionState === INTERVENTION_STATES.questioning;
	const questionBatchIsComplete =
		interventionState === INTERVENTION_STATES.batch_complete;
	const isFinalComplete =
		interventionState === INTERVENTION_STATES.final_complete;
	const studentPresenting =
		interventionState === INTERVENTION_STATES.presenting;

	if (messages && messages.length) {
		const sinceBatch = messages.slice(Math.max(0, batchStartIndex));
		const shouldShowMessages =
			vcIsQuestioning ||
			questionBatchIsComplete ||
			(isFinalComplete && !feedbackGenerated);
		const n = shouldShowMessages ? sinceBatch.length : 0;
		const messagesToShow =
			n > 0 && !studentPresenting ? sinceBatch.slice(-n) : [];

		const lastVisible = messagesToShow[messagesToShow.length - 1];
		const lastVisibleId = lastVisible?.id;

		messageContent = messagesToShow.map(({ content, pending, id }) => {
			// Show loader while the message is still being prepared by the backend.
			// Also show the same loader for the *newest assistant message* while we're in questioning
			// but TTS hasn't started speaking yet.
			const showPreparing =
				pending ||
				(vcIsQuestioning &&
					id === lastVisibleId &&
					!isSpeaking &&
					!answerActive);

			if (showPreparing) {
				return (
					<div
						key={id}
						className="mt-2 self-center flex items-center gap-2"
					>
						<div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 border-t-transparent animate-spin" />
						<span className="text-muted-foreground">Preparing question…</span>
					</div>
				);
			}

			return (
				<div
					key={id}
					className="self-start max-w-[70%] flex"
				>
					<div className="px-4 py-3 rounded-2xl bg-muted text-foreground whitespace-pre-wrap break-words leading-relaxed">
						{content}
					</div>
				</div>
			);
		});
	}

	useLayoutEffect(() => {
		const behavior = didMountRef.current ? "smooth" : "auto";
		endRef.current?.scrollIntoView({ behavior, block: "end" });
		didMountRef.current = true;
	}, [
		messages.length,
		isSpeaking,
		interventionState,
		batchStartIndex,
		answerActive,
	]);

	return (
		<div className="flex-1 min-h-0 flex flex-col">
			<div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
				{messageContent}
				<div ref={endRef} />
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
			<div className="mt-3 mx-5 rounded-md border border-border bg-muted/50 px-3 py-2 flex items-center justify-center shrink-0">
				<span className="text-sm text-muted-foreground font-medium">
					Generating feedback...
				</span>
			</div>
		);
	} else if (genError) {
		return (
			<div className="mt-3 mx-5 rounded-md border border-border bg-muted/50 px-3 py-2 flex items-center justify-center shrink-0">
				<span className="mr-2">❌</span>
				<span className="text-sm text-destructive font-medium">
					Failed to generate feedback...
				</span>
			</div>
		);
	} else if (feedbackGenerated) {
		return (
			<div className="mt-3 mx-5 rounded-md border border-border bg-muted/50 px-3 py-2 flex items-center justify-center shrink-0">
				<span className="mr-2">✅</span>
				<a
					href="/feedback"
					className="text-sm font-medium text-primary underline hover:no-underline"
				>
					View your feedback
				</a>
			</div>
		);
	} else {
		// Edge: complete but not started yet (very brief window)
		status = (
			<span className="text-sm text-muted-foreground font-medium">
				Preparing to generate feedback…
			</span>
		);
	}

	return (
		<div className="mt-3 mx-5 rounded-md border border-border bg-muted/50 px-3 py-2 flex items-center gap-2 shrink-0">
			<span className="text-sm font-medium">Questions Completed</span>
			{status}
		</div>
	);
}

function VcChatContainer({
	answerActive,
	batchStartIndex,
	feedbackGenerated,
	genError,
	interventionState,
	isLoading,
	isSpeaking,
	messages,
	questionsAsked,
	questionsTarget,
	stopCurrentAudio,
}) {
	let vcDisplay = null;
	const vcIsQuestioning = interventionState === INTERVENTION_STATES.questioning;

	if (vcIsQuestioning) {
		const totalQuestions = questionsTarget || 2;

		// Bump the visible count while the current question is being asked (TTS speaking)
		// or while the student is answering (answer window active).
		let displayAsked = questionsAsked;
		if (isSpeaking || answerActive) {
			displayAsked = Math.min(totalQuestions, questionsAsked + 1);
		}

		const vcQuestionsText = `VC Questions (${displayAsked}/${totalQuestions})`;

		vcDisplay = (
			<div className="mt-3 mx-5 rounded-md border border-border bg-muted/50 px-3 py-2 flex items-center gap-2">
				<span className="text-sm">💬</span>
				<span className="text-sm font-medium">{vcQuestionsText}</span>

				<button
					onClick={stopCurrentAudio}
					disabled={!isSpeaking}
					className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-50"
					title="Stop speech"
				>
					🔇
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col min-h-0 flex-1">
			<div className="px-5 py-4 border-b border-border text-center shrink-0">
				<h1 className="text-base font-semibold">VC Mentor</h1>
			</div>

			{vcDisplay}

			<GeneratedFeedback
				interventionState={interventionState}
				feedbackGenerated={feedbackGenerated}
				isLoading={isLoading}
				genError={genError}
			/>

			<IncomingChatMessages
				answerActive={answerActive}
				batchStartIndex={batchStartIndex}
				messages={messages}
				interventionState={interventionState}
				feedbackGenerated={feedbackGenerated}
				isSpeaking={isSpeaking}
			/>
		</div>
	);
}

export default function ChatApp() {
	const { sessionId, studentName } = useSession();
	const { clearCheckpoint } = useCheckpoint();
	const {
		answerActive,
		batchStartIndex,
		getLatestRecording,
		interventionState,
		messages,
		numPages,
		qaTimestamps,
		questionsAsked,
		questionsTarget,
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
	const isFinalComplete =
		interventionState === INTERVENTION_STATES.final_complete;

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

			const baseType = (recordingBlob?.type || "").split(";")[0]; // e.g., "audio/webm" or "audio/ogg"
			const ext = /ogg$/.test(baseType) ? "ogg" : "webm";
			const name = `presentation.${ext}`;
			formData.append("recording", recordingBlob, name);

			formData.append("messages", JSON.stringify(messages));
			formData.append("selectedAssignment", selectedAssignment || "");
			formData.append("slideTimestamps", JSON.stringify(slideTimestamps));
			formData.append("qaTimestamps", JSON.stringify(qaTimestamps));
			formData.append("sessionId", sessionId);
			formData.append("pdfSessionId", sessionId);
			formData.append("studentName", studentName || "Student");
			formData.append("pdfSlideCount", numPages || 0);

			const data = await generateFeedbackMultipart(formData);
			const payloadToStore = data?.structured || data;

			if (
				payloadToStore?.session_id ||
				payloadToStore?.slides ||
				payloadToStore?.feedback ||
				payloadToStore?.qa_feedback
			) {
				setFeedbackGenerated(true);
				clearCheckpoint?.(sessionId);
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
		clearCheckpoint,
		numPages,
		studentName,
	]);

	// Keep ChatApp in sync with the TTS engine.
	// Subscribes to TTSService and updates avatarState whenever the VC starts/stops speaking or is loading audio.
	useEffect(() => {
		const handleTTSStateChange = (state) => setAvatarState(state);
		TTSService.addListener(handleTTSStateChange);
		return () => TTSService.removeListener(handleTTSStateChange);
	}, []);

	useEffect(() => {
		if (isFinalComplete && !hasTriggeredFeedback) {
			setHasTriggeredFeedback(true);
			generateFeedback();
		}
	}, [isFinalComplete, hasTriggeredFeedback, generateFeedback]);

	// reset feedback-related flags when the session changes
	useEffect(() => {
		setHasTriggeredFeedback(false);
		setFeedbackGenerated(false);
		setGenError(null);
	}, [sessionId, selectedAssignment]);

	const stopCurrentAudio = () => {
		TTSService.stop();
	};

	return (
		<div className="w-full flex-1 min-h-0 flex flex-col overflow-hidden">
			<Avatar
				isSpeaking={avatarState.isSpeaking}
				isLoading={avatarState.isLoading}
				isProcessing={isLoading}
			/>

			<VcChatContainer
				answerActive={answerActive}
				batchStartIndex={batchStartIndex}
				feedbackGenerated={feedbackGenerated}
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
