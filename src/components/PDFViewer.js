import { useState, useEffect, useRef, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import RecordPromptModal from "./modal/RecordPromptModal";
import { PausedIcon, RecordingIcon } from "./ui/RecordingIcon";
import { Button } from "./ui/button";

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
	uploadedFile,
	isActive,
}) {
	const [answerSecondsLeft, setAnswerSecondsLeft] = useState(-1);
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

	useEffect(() => {
		if (inQA && answerActive) {
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

	if (!uploadedFile || !isActive || isFinished) return null;

	// ----- Recording status row -----
	let statusRow = null;
	let formattedTime =
		isPaused || isRecording ? formatTime(recordingTime) : null;

	// Paused status
	if (isPaused) {
		statusRow = (
			<>
				<div className="md:text-base font-medium">Recording Paused</div>
				<PausedIcon
					className="text-muted-foreground"
					size={20}
				/>
				<span className="ml-3 text-sm md:text-base font-medium text-muted-foreground">
					{formattedTime}
				</span>
			</>
		);
	} else if (isRecording) {
		statusRow = (
			<>
				<RecordingIcon
					className="text-destructive"
					size={20}
				/>
				<span className="ml-3 text-sm md:text-base font-medium text-destructive">
					{formattedTime}
				</span>
			</>
		);
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
				<div className="px-3 py-1 rounded bg-amber-100 text-amber-800 font-semibold">
					Time left: {timeLeft}
				</div>
				<Button
					onClick={handleOnContinue}
					className="h-auto"
					title="Finish answer and continue"
				>
					Continue
				</Button>
			</div>
		);
	}

	return (
		<div className="w-full flex flex-row items-center justify-center py-3 gap-4">
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
		<Button
			className="h-auto"
			disabled={disableButton}
			onClick={onClickHandler}
		>
			{buttonText}
		</Button>
	);
}

export default function PDFViewer() {
	const { sessionId } = useSession();
	const {
		answerActive,
		answerSecondsDefault,
		endAnswerWindow,
		handleSlideAdvance: onSlideAdvance,
		handleSlideLockTriggered: onSlideLockTriggered,
		interventionState,
		isPaused,
		isRecording,
		numPages,
		recordingTime,
		setNumPages,
		setSelectedAssignment: onAssignmentChange,
		setSlideTimestamps,
		slideTimestamps,
		startRecording,
	} = useAppContext();

	const [uploadedFile, setUploadedFile] = useState(null);
	const [pageNumber, setPageNumber] = useState(1);
	const [scale, setScale] = useState(1.0);
	const [error, setError] = useState(null);
	const [isLocked, setIsLocked] = useState(false);
	const [furthestVisited, setFurthestVisited] = useState(1);
	const [showRecordModal, setShowRecordModal] = useState(false);

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
	const isActive = interventionState !== INTERVENTION_STATES.inactive;
	console.log("interventionState:", interventionState);

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
	}, [isInterventionComplete, isLocked]);

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
	}, [isRecording, isPaused, slideTimestamps, setSlideTimestamps]);

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
		// reset visible state to make selection feel fresh
		setUploadedFile(null);
		setNumPages(null);
		setPageNumber(1);
		setFurthestVisited(1);
		setIsLocked(false);
		unlockedSlidesRef.current.clear();

		// clear and click hidden input; same-file reselect will trigger onChange
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
		<div className="flex h-full min-h-0 flex-col">
			<RecordPromptModal
				open={showRecordModal}
				onClose={handleCloseRecordingModal}
				onStart={handleStartFromModal}
				onUploadDifferent={handleUploadDifferent}
			/>

			<div
				className={
					uploadedFile
						? "px-5 py-4 border-b border-border"
						: "px-5 py-8 border-b border-border min-h-full flex items-center"
				}
			>
				<div className="mb-4 flex flex-1 items-center">
					{!uploadedFile && (
						<div className="w-full flex items-center justify-center">
							<label
								htmlFor="pdf-upload"
								className="block w-full max-w-xl mx-auto text-center cursor-pointer rounded-xl border-2 border-dashed border-primary/40 bg-muted/50 px-5 py-[3.25rem] transition-all hover:-translate-y-0.5 hover:bg-accent/30"
							>
								<div className="flex flex-col items-center gap-3">
									<div className="text-5xl">📄</div>
									<div className="text-lg font-semibold">
										Upload your assignment
									</div>
									<div className="text-sm text-muted-foreground">
										Select a PDF file to get started
									</div>
								</div>
							</label>
							<input
								id="pdf-upload"
								type="file"
								accept="application/pdf"
								onChange={handleFileUpload}
								style={{ display: "none" }}
							/>
						</div>
					)}
				</div>

				{uploadedFile && (
					<div className="flex flex-wrap items-center justify-between gap-5">
						<div className="flex items-center gap-3">
							<Button
								onClick={handlePreviousPage}
								disabled={pageNumber <= 1 || isFinalComplete}
								className="h-auto"
							>
								Previous
							</Button>
							<span className="text-sm text-muted-foreground font-medium">
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
							<div className="flex items-center gap-2 ml-3 pl-3 border-l border-border">
								<span
									role="img"
									aria-label={lockTitle}
									title={lockTitle}
									className={lockClasses}
								>
									{lockIcon}
								</span>

								{isLocked && (
									<span className="text-xs font-medium text-amber-800 bg-amber-100 border border-amber-200 rounded px-2 py-0.5">
										{lockText}
									</span>
								)}
							</div>
						</div>

						<div className="flex items-center gap-3">
							<Button
								onClick={zoomOut}
								className="h-auto"
							>
								Zoom Out
							</Button>
							<span className="text-sm text-muted-foreground font-medium">
								{Math.round(scale * 100)}%
							</span>
							<Button
								onClick={zoomIn}
								className="h-auto"
							>
								Zoom In
							</Button>
						</div>
					</div>
				)}
			</div>

			<div className="flex-1 min-h-0 overflow-auto p-3 sm:p-5 bg-muted">
				{error && (
					<div className="flex items-center justify-center h-full text-destructive">
						<p>{error}</p>
					</div>
				)}

				{uploadedFile && (
					<div className="w-full min-h-full grid place-items-center">
						<Document
							file={uploadedFile}
							onLoadSuccess={onDocumentLoadSuccess}
							onLoadError={onDocumentLoadError}
							loading={
								<div className="flex items-center justify-center h-full text-muted-foreground">
									<p>Loading PDF...</p>
								</div>
							}
							error={
								<div className="flex items-center justify-center h-full text-destructive">
									Failed to load PDF
								</div>
							}
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

			<div className="border-t border-border bg-card">
				<RecordingBar
					isRecording={isRecording}
					isPaused={isPaused}
					recordingTime={recordingTime}
					interventionState={interventionState}
					answerActive={answerActive}
					answerSecondsDefault={answerSecondsDefault}
					onContinue={endAnswerWindow}
					uploadedFile={uploadedFile}
					isActive={isActive}
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
