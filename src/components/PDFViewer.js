import { useState, useEffect, useRef } from "react";
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

	useEffect(() => {
		onContinueRef.current = onContinue;
	}, [onContinue]);

	// Start/stop the local countdown when in Q&A and answer window is active.
	useEffect(() => {
		const inQA = interventionState === INTERVENTION_STATES.questioning;

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
	}, [interventionState, answerActive, answerSecondsDefault]);

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
	}

	let countdownTimerContent = null;
	if (
		interventionState === INTERVENTION_STATES.questioning &&
		answerActive &&
		isRecording &&
		!isPaused
	) {
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
	disabled,
	handleFinishButton,
	handleNextPage,
}) {
	const isLastPage = numPages ? pageNumber === numPages : false;

	const nextButton = (
		<button
			className="control-btn"
			disabled={disabled}
			onClick={handleNextPage}
		>
			Next
		</button>
	);

	const finishButton = (
		<button
			className="control-btn"
			disabled={disabled}
			onClick={handleFinishButton}
		>
			Finish
		</button>
	);

	return isLastPage ? finishButton : nextButton;
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
	const [uploadedFileName, setUploadedFileName] = useState("");
	const [numPages, setNumPages] = useState(null);
	const [pageNumber, setPageNumber] = useState(1);
	const [scale, setScale] = useState(1.0);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

	// Slide locking state
	const [isLocked, setIsLocked] = useState(false);
	const [lockTriggerSlides, setLockTriggerSlides] = useState([]); // Will be set to [numPages] when PDF loads
	const [unlockedSlides, setUnlockedSlides] = useState(new Set()); // Track which slides have been manually unlocked

	// Slide timestamp tracking for audio splitting
	const [slideTimestamps, setSlideTimestamps] = useState([]);

	// show modal after successful upload
	const [showRecordModal, setShowRecordModal] = useState(false);

	// ref to hidden replace-file input (for "upload different file")
	const replaceInputRef = useRef(null);
	const isInterventionComplete =
		interventionState === INTERVENTION_STATES.batch_complete ||
		interventionState === INTERVENTION_STATES.final_complete;

	// Handle auto-unlock when intervention is complete
	useEffect(() => {
		if (isInterventionComplete && isLocked) {
			setIsLocked(false);
			setUnlockedSlides((prev) => new Set([...prev, pageNumber]));
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
		setUploadedFileName(file.name);
		setLoading(true);
		setError(null);
		setNumPages(null);
		setPageNumber(1);
		setIsLocked(false);
		setUnlockedSlides(new Set());

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
			setUploadedFileName("");
			setNumPages(null);
			setPageNumber(1);
		} finally {
			setLoading(false);
			if (event?.target) {
				event.target.value = "";
			}
		}
	};

	const onDocumentLoadSuccess = ({ numPages }) => {
		console.log("PDF loaded successfully with", numPages, "pages");
		setNumPages(numPages);
		setPageNumber(1);
		setError(null);
		setIsLocked(false); // Reset lock state on new document
		setUnlockedSlides(new Set()); // Reset unlocked slides tracking

		const triggers = Array.from(
			{ length: Math.floor(numPages / 2) },
			(_, i) => (i + 1) * 2
		);

		if (!triggers.includes(numPages)) {
			triggers.push(numPages); // odd slide count → last page triggers a 1-question batch
		}

		setLockTriggerSlides(triggers);

		// Only way to start recording is via this modal
		setShowRecordModal(true);
		setLoading(false);
	};

	const onDocumentLoadError = (error) => {
		console.error("PDF load error:", error);
		setError(`Failed to load PDF: ${error.message}`);
		setLoading(false);
	};

	const changePage = (offset) => {
		const newPageNumber = Math.max(1, Math.min(numPages, pageNumber + offset));

		// Check if trying to advance from a lock trigger slide that hasn't been unlocked yet
		if (
			offset > 0 &&
			lockTriggerSlides.includes(pageNumber) &&
			!unlockedSlides.has(pageNumber)
		) {
			setIsLocked(true);

			// Notify parent component that slide lock was triggered
			const isFinalBatch = !!numPages && pageNumber === numPages;
			onSlideLockTriggered(pageNumber, isFinalBatch);

			return; // Prevent navigation when lock triggers
		}

		// Prevent forward navigation if currently locked
		if (offset > 0 && isLocked) {
			console.log("Navigation blocked - slide is locked");
			return;
		}

		setPageNumber(newPageNumber);

		if (offset > 0) {
			const newTimeStamp = {
				slideNumber: newPageNumber,
				// IMPORTANT: use the same counter as QA so pauses don’t create drift
				timestamp: recordingTime,
			};

			setSlideTimestamps((prev) => [...prev, newTimeStamp]);
		}

		// Notify parent when advancing slides (for recording resume)
		if (offset > 0 && onSlideAdvance) {
			onSlideAdvance();
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
		// open the replace-file chooser and keep the modal UX clean
		if (replaceInputRef.current) {
			replaceInputRef.current.value = null;
		}

		// Open the replace-file chooser and keep the modal UX clean
		replaceInputRef.current?.click();
		setShowRecordModal(false);
	};

	const handleNextPage = () => changePage(1);

	const handleFinishButton = async () => {
		if (pageNumber !== numPages) return;
		setIsLocked(true);
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
					{!uploadedFile ? (
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
					) : (
						<div className="uploaded-file-info">
							<span className="file-name">📄 {uploadedFileName}</span>
							<label
								htmlFor="pdf-replace"
								className="replace-file-btn"
							>
								Replace File
							</label>
							<input
								id="pdf-replace"
								ref={replaceInputRef}
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
								onClick={() => changePage(-1)}
								disabled={pageNumber <= 1}
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
								disabled={isLocked || !isRecording}
								handleFinishButton={handleFinishButton}
								handleNextPage={handleNextPage}
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
				{loading && (
					<div className="pdf-loading">
						<p>Loading PDF...</p>
					</div>
				)}

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
		</div>
	);
}
