import { useState, useEffect, useRef, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import RecordPromptModal from "./modal/RecordPromptModal";
import { PausedIcon, RecordingIcon } from "./ui/RecordingIcon";
import { postPdfForSlides } from "../services/api";
import { useAppContext } from "../hooks/useAppContext";
import { useSession } from "../hooks/useSession";
import { formatTime } from "../utils";
import { INTERVENTION_STATES } from "../constants";

// Use the local worker from public directory
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB; adjust if needed

function RecordingBar({
	isRecording,
	isPaused,
	recordingTime,
	interventionState,
	answerActive,
	answerSecondsDefault,
	onContinue,
}) {
	const [answerSecondsLeft, setAnswerSecondsLeft] = useState(0);
	const answerTimerRef = useRef(null);
	const onContinueRef = useRef(onContinue);
	const hasFiredEndRef = useRef(false); // local one-shot guard

	const inQA = !!(interventionState === INTERVENTION_STATES.questioning);
	const isFinished = !!(
		interventionState === INTERVENTION_STATES.final_complete
	);

	useEffect(() => {
		onContinueRef.current = onContinue;
	}, [onContinue]);

	// Start/stop the local countdown when in Q&A and answer window is active.
	useEffect(() => {
		if (inQA && answerActive) {
			// reset any prior
			if (answerTimerRef.current) {
				clearInterval(answerTimerRef.current);
				answerTimerRef.current = null;
			}

			hasFiredEndRef.current = false;
			setAnswerSecondsLeft(answerSecondsDefault || 30);

			answerTimerRef.current = setInterval(() => {
				setAnswerSecondsLeft((prev) => {
					if (prev <= 1) {
						clearInterval(answerTimerRef.current);
						answerTimerRef.current = null;

						// behaves like clicking Continue
						if (!hasFiredEndRef.current) {
							hasFiredEndRef.current = true;
							onContinueRef.current?.("timeout");
						}

						return 0;
					}
					return prev - 1;
				});
			}, 1000);
		} else {
			if (answerTimerRef.current) {
				clearInterval(answerTimerRef.current);
				answerTimerRef.current = null;
			}
			setAnswerSecondsLeft(0);
		}
		return () => {
			if (answerTimerRef.current) {
				clearInterval(answerTimerRef.current);
				answerTimerRef.current = null;
			}
		};
	}, [inQA, answerActive, answerSecondsDefault]);

	// ----- Recording status row -----
	const textStyles = "text-md font-medium";
	let statusRow = (
		<div className={`${textStyles} text-gray-500`}>Waiting to start...</div>
	);
	let formattedTime =
		isPaused || isRecording ? formatTime(recordingTime) : null;

	// Paused status
	if (isPaused) {
		statusRow = (
			<>
				{/* <div className={`${textStyles} text-white`}>Recording Paused</div> */}
				<PausedIcon />
				<span className="ml-3 text-md font-medium text-gray-400">
					{formattedTime}
				</span>
			</>
		);
	} else if (isRecording) {
		statusRow = (
			<>
				<RecordingIcon />
				<span className="ml-3 text-md font-medium text-red-600">
					{formattedTime}
				</span>
			</>
		);
	} else if (isFinished) {
		statusRow = null;
	}

	let countdownTimerContent = null;
	if (inQA && answerActive && isRecording && !isPaused) {
		const timeLeft = formatTime(answerSecondsLeft);
		const handleOnContinue = () => {
			// one-shot: cancel timer and fire once
			if (answerTimerRef.current) {
				clearInterval(answerTimerRef.current);
				answerTimerRef.current = null;
			}

			if (!hasFiredEndRef.current) {
				hasFiredEndRef.current = true;
				onContinueRef.current?.("continue");
			}
		};

		countdownTimerContent = (
			<div className="flex items-center justify-center gap-3">
				<div className="px-3 py-1 rounded bg-yellow-100 text-yellow-800 font-semibold">
					Time left: {timeLeft}
				</div>
				<button
					onClick={handleOnContinue}
					className="control-btn"
					title="Finish answer and continue"
				>
					Continue
				</button>
			</div>
		);
	}

	return (
		<div className="w-full flex flex-col items-center justify-center py-3 gap-2">
			<div className="flex items-center">{statusRow}</div>
			{countdownTimerContent}
		</div>
	);
}

function AdvanceSlideButton({
	pageNumber,
	numPages,
	handleFinishButton,
	handleNextPage,
	isRecording,
	isLocked,
	furthestVisited,
	isReviewingPast,
}) {
	const isLastPage = numPages ? pageNumber === numPages : false;

	// Disable when not recording, or when locked *and* at/ beyond the frontier
	// (you may only "Forward" up to the furthestVisited while locked).
	const disableButton =
		!isRecording || (isLocked && pageNumber >= furthestVisited);
	const buttonText = isLastPage
		? "Finish"
		: isReviewingPast
		? "Forward"
		: "Next";
	const onClickHandler = isLastPage ? handleFinishButton : handleNextPage;

	return (
		<button
			className="control-btn"
			disabled={disableButton}
			onClick={onClickHandler}
		>
			{buttonText}
		</button>
	);
}

export default function PDFViewer() {
	const { sessionId } = useSession();
	const {
		isPaused,
		isRecording,
		recordingTime,
		startRecording,
		interventionState,
		answerActive,
		endAnswerWindow,
		answerSecondsDefault,
		setSelectedAssignment: onAssignmentChange,
		handleSlideAdvance: onSlideAdvance,
		handleSlideLockTriggered: onSlideLockTriggered,
		setSlideTimestamps: onSlideTimestampsChange,
	} = useAppContext();

	const [uploadedFile, setUploadedFile] = useState(null);
	const [numPages, setNumPages] = useState(null);
	const [pageNumber, setPageNumber] = useState(1);
	const [scale, setScale] = useState(1.0);
	const [error, setError] = useState(null);
	const [isLocked, setIsLocked] = useState(false);
	const [furthestVisited, setFurthestVisited] = useState(1);
	const [showRecordModal, setShowRecordModal] = useState(false);
	// Slide timestamp tracking for audio splitting
	const [slideTimestamps, setSlideTimestamps] = useState([]);

	// ref to hidden replace-file input (for "upload different file")
	const replaceInputRef = useRef(null);
	const unlockedSlidesRef = useRef(new Set());
	const lastLockTriggerSlideRef = useRef(null);

	const lockTriggerSlides = useMemo(() => {
		if (!numPages) return [];
		const triggers = Array.from(
			{ length: Math.floor(numPages / 2) },
			(_, i) => (i + 1) * 2
		);
		if (!triggers.includes(numPages)) triggers.push(numPages);
		return triggers;
	}, [numPages]);

	const isFinalComplete =
		interventionState === INTERVENTION_STATES.final_complete;
	const isInterventionComplete =
		interventionState === INTERVENTION_STATES.batch_complete || isFinalComplete;

	// When the student is viewing a slide before the furthest they've actually presented,
	// we are in "catch-up" review mode.
	const isReviewingPast = pageNumber < furthestVisited;

	// Handle auto-unlock when intervention is complete
	useEffect(() => {
		if (isInterventionComplete && isLocked) {
			setIsLocked(false);
			if (lastLockTriggerSlideRef.current != null) {
				unlockedSlidesRef.current.add(lastLockTriggerSlideRef.current);
				lastLockTriggerSlideRef.current = null;
			}
		}
	}, [isInterventionComplete, isLocked, pageNumber]);

	// Initialize first slide stamp at 0s when recording starts; clear after a true end
	useEffect(() => {
		if (isRecording && slideTimestamps.length === 0) {
			// Initialize timestamps with slide 1
			const initialTimestamp = { slideNumber: 1, timestamp: 0 };
			setSlideTimestamps([initialTimestamp]);
		}

		// Clear stamps after a *true* end (not just pause)
		if (!isRecording && !isPaused && slideTimestamps.length > 0) {
			setSlideTimestamps([]);
		}
	}, [isRecording, isPaused, slideTimestamps]);

	useEffect(() => {
		if (slideTimestamps.length) {
			onSlideTimestampsChange?.(slideTimestamps);
		}
	}, [slideTimestamps, onSlideTimestampsChange]);

	const handleFileUpload = async (event) => {
		const file = event.target.files && event.target.files[0];

		// Be liberal in what we accept: some browsers leave type empty
		const fileType = file?.type || "";
		const fileName = file?.name || "";
		const isPdfByType =
			fileType === "application/pdf" ||
			fileType === "application/x-pdf" ||
			fileType === "application/acrobat";
		const isPdfByName = /\.pdf$/i.test(fileName || "");

		if (!file || !(isPdfByType || isPdfByName)) {
			setError("Please upload a valid PDF file.");
			return;
		}

		if (file.size > MAX_PDF_BYTES) {
			setError(
				`PDF too large (max ${Math.round(MAX_PDF_BYTES / (1024 * 1024))}MB).`
			);
			return;
		}

		// Optimistically set UI; if upload fails we'll reset
		setUploadedFile(file);
		setError(null);
		setNumPages(null);
		setPageNumber(1);
		setFurthestVisited(1);
		setIsLocked(false);
		unlockedSlidesRef.current.clear();

		// Build Form:
		const formData = new FormData();
		formData.append("file", file);

		// include DB session so backend can update Session row
		if (sessionId) {
			formData.append("sessionId", sessionId);
		}

		try {
			const data = await postPdfForSlides(formData);

			// Use server-provided safe filename for /assignments/slides
			if (onAssignmentChange) {
				onAssignmentChange(data.filename); // Use the safe filename that was saved to assignments
			}
		} catch (error) {
			console.error("❌ PDF upload error:", error);
			setError(`Upload error: ${error.message}`);

			// revert optimistic UI so user can pick again
			setUploadedFile(null);
			setNumPages(null);
			setPageNumber(1);
		} finally {
			if (event?.target) {
				event.target.value = "";
			}
		}
	};

	const onDocumentLoadSuccess = ({ numPages }) => {
		setNumPages(numPages);
		setPageNumber(1);
		setError(null);
		setIsLocked(false); // Reset lock state on new document
		unlockedSlidesRef.current.clear(); // Reset unlocked slides tracking
		setFurthestVisited(1);
		// Only way to start recording is via this modal
		setShowRecordModal(true);
	};

	const onDocumentLoadError = (error) => {
		console.error("PDF load error:", error);
		setError(`Failed to load PDF: ${error.message}`);
	};

	const onChangePage = (offset) => {
		if (!numPages) return;
		const clamped = Math.max(1, Math.min(numPages, pageNumber + offset));

		// === While LOCKED (VC questioning) ===
		// Allow bounded navigation:
		//  - Backwards always OK (if > 1)
		//  - Forwards only up to the furthestVisited (catch-up). No stamps/locks/callbacks.
		if (isLocked) {
			if (offset < 0 && pageNumber > 1) {
				// Allow backward navigation
				setPageNumber(clamped);
				return;
			}

			if (offset > 0 && pageNumber < furthestVisited) {
				// Allow forward navigation
				setPageNumber(clamped);
				return;
			}

			// At or beyond the frontier while locked → block
			return;
		}

		// === Not locked ===
		// Catch-up forward moves (when reviewing past slides) do not advance program.
		if (pageNumber < furthestVisited && offset > 0) {
			setPageNumber(clamped);
			return;
		}

		// === Advancing the frontier (presenting new content) ===
		// We only consider locks/timestamps when moving forward from the frontier.
		const isAdvancingFrontier = offset > 0 && pageNumber === furthestVisited;
		if (isAdvancingFrontier) {
			// Trigger lock at the *current* frontier slide if it’s a lock trigger.
			if (
				lockTriggerSlides.includes(pageNumber) &&
				!unlockedSlidesRef.current.has(pageNumber)
			) {
				setIsLocked(true);
				lastLockTriggerSlideRef.current = pageNumber; // remember which slide locked
				const isFinalBatch = !!numPages && pageNumber === numPages;
				onSlideLockTriggered(pageNumber, isFinalBatch);
				return; // locked: block forward navigation...
			}
		}

		// Perform the actual navigation
		setPageNumber(clamped);

		// Advance the frontier (program state) if we truly moved it forward.
		if (isAdvancingFrontier && clamped > furthestVisited) {
			// Move the frontier to the new page if we actually moved forward
			if (clamped > furthestVisited) {
				setFurthestVisited(clamped);
				setSlideTimestamps((prev) => [
					...prev,
					{ slideNumber: clamped, timestamp: recordingTime },
				]);
			}

			// Notify parent (resume recording after batch complete, etc.)
			onSlideAdvance?.();
		}
	};

	const zoomIn = () => {
		setScale((prevScale) => Math.min(3.0, prevScale + 0.2));
	};

	const zoomOut = () => {
		setScale((prevScale) => Math.max(0.5, prevScale - 0.2));
	};

	// handlers for the modal buttons
	const handleStartFromModal = () => {
		startRecording?.();
		setShowRecordModal(false);
	};

	const handleUploadDifferent = () => {
		// reset so choosing the same file fires onChange
		if (replaceInputRef.current) replaceInputRef.current.value = null;
		// Defer click until after any state updates
		setTimeout(() => replaceInputRef.current?.click(), 0);
		setShowRecordModal(false);
	};

	const handleNextPage = () => onChangePage(1);
	const handlePreviousPage = () => onChangePage(-1);

	const handleFinishButton = async () => {
		if (pageNumber !== numPages) return;
		setIsLocked(true);
		lastLockTriggerSlideRef.current = pageNumber; // treat Finish like an explicit lock trigger
		onSlideLockTriggered(pageNumber, true);
	};

	const handleCloseRecordingModal = () => {
		setShowRecordModal(false);
	};

	const lockText = isLocked ? "Slide Locked. Answer VC Questions" : "";
	const lockIcon = isLocked ? "🔒" : "🔓";
	const lockTitle = isLocked
		? "Locked — answer VC questions to continue"
		: "Unlocked";
	const lockClasses = `inline-flex items-center justify-center text-[18px] p-1.5 rounded select-none ${
		isLocked ? "bg-[#fff3cd] text-yellow-800" : "bg-transparent text-gray-600"
	}`;

	return (
		<div className="pdf-viewer">
			<RecordPromptModal
				open={showRecordModal}
				onClose={handleCloseRecordingModal}
				onStart={handleStartFromModal}
				onUploadDifferent={handleUploadDifferent}
			/>

			<div className="pdf-controls">
				<div className="file-upload-section">
					{!uploadedFile && (
						<div className="upload-container">
							<label
								htmlFor="pdf-upload"
								className="upload-label"
							>
								<div className="upload-content">
									<div className="upload-icon">📄</div>
									<div className="upload-text">Upload your assignment</div>
									<div className="upload-subtext">
										Select a PDF file to get started
									</div>
								</div>
							</label>
							<input
								id="pdf-upload"
								type="file"
								accept="application/pdf"
								onChange={handleFileUpload}
								className="file-input"
								style={{ display: "none" }}
							/>
						</div>
					)}
				</div>

				{uploadedFile && (
					<div className="pdf-toolbar">
						<div className="page-controls">
							<button
								onClick={handlePreviousPage}
								disabled={pageNumber <= 1 || isFinalComplete}
								className="control-btn"
							>
								Previous
							</button>
							<span className="page-info">
								Page {pageNumber} of {numPages || "?"}
							</span>
							<AdvanceSlideButton
								pageNumber={pageNumber}
								numPages={numPages}
								handleFinishButton={handleFinishButton}
								handleNextPage={handleNextPage}
								isReviewingPast={isReviewingPast}
								isRecording={isRecording}
								isLocked={isLocked}
								furthestVisited={furthestVisited}
							/>

							{/* Lock indicator and control */}
							<div className="lock-controls">
								<span
									role="img"
									aria-label={lockTitle}
									title={lockTitle}
									className={lockClasses}
								>
									{lockIcon}
								</span>

								{isLocked && <span className="lock-status">{lockText}</span>}
							</div>
						</div>

						<div className="zoom-controls">
							<button
								onClick={zoomOut}
								className="control-btn"
							>
								Zoom Out
							</button>
							<span className="zoom-info">{Math.round(scale * 100)}%</span>
							<button
								onClick={zoomIn}
								className="control-btn"
							>
								Zoom In
							</button>
						</div>
					</div>
				)}
			</div>

			<div className="pdf-content">
				{error && (
					<div className="pdf-error">
						<p>{error}</p>
					</div>
				)}

				{uploadedFile && (
					<div className="pdf-document">
						<Document
							file={uploadedFile}
							onLoadSuccess={onDocumentLoadSuccess}
							onLoadError={onDocumentLoadError}
							loading={<div>Loading PDF...</div>}
							error={<div>Failed to load PDF</div>}
							noData={<div>No PDF file specified</div>}
						>
							{numPages && (
								<Page
									pageNumber={pageNumber}
									scale={scale}
									renderTextLayer={true}
									renderAnnotationLayer={true}
								/>
							)}
						</Document>
					</div>
				)}
			</div>

			<div className="recording-section">
				<RecordingBar
					isRecording={isRecording}
					isPaused={isPaused}
					recordingTime={recordingTime}
					interventionState={interventionState}
					answerActive={answerActive}
					answerSecondsDefault={answerSecondsDefault}
					onContinue={endAnswerWindow}
				/>
			</div>

			<input
				ref={replaceInputRef}
				type="file"
				accept="application/pdf"
				onChange={handleFileUpload}
				style={{ display: "none" }}
			/>
		</div>
	);
}
