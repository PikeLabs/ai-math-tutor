import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import RecordPromptModal from "./components/modal/RecordPromptModal";
import RecordingIcon from "./components/ui/RecordingIcon";
import { postPdfForSlides } from "./services/api";
import { useAppContext } from "./contexts/AppContext";
import { formatTime } from "./utils/recording.utils";

// Use the local worker from public directory
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

function RecordingStatus({ isRecording, isPaused, recordingTime }) {
	let recordingStatus = (
		<div className="px-4 py-2 text-gray-600 font-medium">
			Waiting to start...
		</div>
	);
	let formattedTime =
		isPaused || isRecording ? formatTime(recordingTime) : null;

	// Paused status
	if (isPaused) {
		recordingStatus = (
			<div className="px-4 py-2 rounded-md bg-gray-600 border border-gray-300 text-white font-medium">
				Recording Paused
			</div>
		);
		formattedTime = (
			<span className="ml-3 text-sm text-gray-600">{formattedTime}</span>
		);
	} else if (isRecording) {
		recordingStatus = <RecordingIcon />;
		formattedTime = (
			<span className="ml-3 text-sm text-red-600">{formattedTime}</span>
		);
	}

	return (
		<div className="w-full flex items-center justify-center py-3">
			{recordingStatus}
			{formattedTime}
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
	const {
		autoUnlockReady,
		isPaused,
		isRecording,
		recordingTime,
		startRecording,
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
	const [recordingStartTime, setRecordingStartTime] = useState(null);

	// show modal after successful upload
	const [showRecordModal, setShowRecordModal] = useState(false);

	// TODO: Test this flow
	// ref to hidden replace-file input (for "upload different file")
	const replaceInputRef = useRef(null);

	// Handle auto-unlock when intervention is complete
	useEffect(() => {
		if (autoUnlockReady && isLocked) {
			setIsLocked(false);
			// Also mark this slide as permanently unlocked
			setUnlockedSlides((prev) => new Set([...prev, pageNumber]));
			console.log(
				`Auto-unlock triggered for slide ${pageNumber} after intervention completion`
			);
		}
	}, [autoUnlockReady, isLocked, pageNumber]);

	// Track recording start time for timestamp calculations
	useEffect(() => {
		if (isRecording && !recordingStartTime) {
			const startTime = Date.now();
			setRecordingStartTime(startTime);
			console.log("📊 Recording start time tracked:", startTime);

			// Initialize timestamps with slide 1
			const initialTimestamp = { slideNumber: 1, timestamp: 0 };
			setSlideTimestamps([initialTimestamp]);

			// Notify parent of timestamp changes
			if (onSlideTimestampsChange) {
				onSlideTimestampsChange([initialTimestamp]);
			}
		} else if (!isRecording && !isPaused && recordingStartTime) {
			// Only reset when not recording AND not paused (i.e., truly ended)
			setRecordingStartTime(null);
			setSlideTimestamps([]);
			console.log("📊 Recording timestamp tracking reset");
		}
	}, [isRecording, isPaused, recordingStartTime, onSlideTimestampsChange]);

	const FILE_TYPE_PDF = "application/pdf";
	const handleFileUpload = async (event) => {
		const file = event.target.files[0];
		if (file && file.type === FILE_TYPE_PDF) {
			setUploadedFile(file);
			setUploadedFileName(file.name);
			setLoading(true);
			setError(null);
			setNumPages(null);
			setPageNumber(1);
			setIsLocked(false);
			setUnlockedSlides(new Set());

			try {
				// Process PDF to extract slide images
				console.log("📄 Processing PDF for slide extraction...");
				const formData = new FormData();
				formData.append("file", file);

				const response = await postPdfForSlides(formData);
				const data = await response.json();

				if (response.ok) {
					console.log("✅ PDF processed successfully:", data);
					// Store session ID for later use in feedback
					localStorage.setItem("currentPDFSession", data.session_id);
					localStorage.setItem("currentPDFSlideCount", data.slide_count);

					// Notify parent component about file upload using the server-generated filename
					if (onAssignmentChange) {
						onAssignmentChange(data.filename); // Use the safe filename that was saved to assignments
					}

					// Only way to start recording is via this modal
					setShowRecordModal(true);
				} else {
					console.error("❌ PDF processing failed:", data.error);
					setError(`Failed to process PDF: ${data.error}`);
				}
			} catch (error) {
				console.error("❌ PDF upload error:", error);
				setError(`Upload error: ${error.message}`);
			} finally {
				setLoading(false);
			}
		} else {
			setError("Please select a valid PDF file");
		}
	};

	const onDocumentLoadSuccess = ({ numPages }) => {
		console.log("PDF loaded successfully with", numPages, "pages");
		setNumPages(numPages);
		setPageNumber(1);
		setLoading(false);
		setError(null);
		setIsLocked(false); // Reset lock state on new document
		setUnlockedSlides(new Set()); // Reset unlocked slides tracking
		setLockTriggerSlides([numPages]); // Set lock to trigger only on the last page
	};

	const onDocumentLoadError = (error) => {
		console.error("PDF load error:", error);
		setError(`Failed to load PDF: ${error.message}`);
		setLoading(false);
	};

	// Remove handleAssignmentChange since we're using file upload
	const changePage = (offset) => {
		const newPageNumber = Math.max(1, Math.min(numPages, pageNumber + offset));

		// Check if trying to advance from a lock trigger slide that hasn't been unlocked yet
		if (
			offset > 0 &&
			lockTriggerSlides.includes(pageNumber) &&
			!unlockedSlides.has(pageNumber)
		) {
			setIsLocked(true);
			console.log(`Slide ${pageNumber} triggered auto-lock`);

			// Notify parent component that slide lock was triggered
			if (onSlideLockTriggered) {
				onSlideLockTriggered(pageNumber);
			}

			return; // Prevent navigation when lock triggers
		}

		// Prevent forward navigation if currently locked
		if (offset > 0 && isLocked) {
			console.log("Navigation blocked - slide is locked");
			return;
		}

		setPageNumber(newPageNumber);

		// Record timestamp when advancing to next slide during recording
		if (offset > 0 && isRecording && recordingStartTime) {
			const currentTime = Date.now();
			const elapsedSeconds = (currentTime - recordingStartTime) / 1000;
			const newTimestamp = {
				slideNumber: newPageNumber,
				timestamp: elapsedSeconds,
			};

			setSlideTimestamps((prev) => {
				const updated = [...prev, newTimestamp];
				// Notify parent of timestamp changes
				if (onSlideTimestampsChange) {
					onSlideTimestampsChange(updated);
				}
				return updated;
			});

			console.log(
				`📊 Slide ${newPageNumber} timestamp recorded: ${elapsedSeconds}s`
			);
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

	const toggleLock = () => {
		if (isLocked) {
			// Unlocking - mark this slide as unlocked permanently
			setUnlockedSlides((prev) => new Set([...prev, pageNumber]));
			setIsLocked(false);
			console.log(`Slide ${pageNumber} unlocked manually - can now advance`);
		} else {
			// Manual lock (probably won't be used much, but keeping for completeness)
			setIsLocked(true);
			console.log(`Slide ${pageNumber} locked manually`);
		}
	};

	// handlers for the modal buttons
	const handleStartFromModal = () => {
		startRecording?.();
		setShowRecordModal(false);
	};

	const handleUploadDifferent = () => {
		// open the replace-file chooser and keep the modal UX clean
		replaceInputRef.current?.click();
		setShowRecordModal(false);
	};

	const handleNextPage = () => changePage(1);

	const handleFinishButton = async () => {
		if (pageNumber !== numPages) return;

		setIsLocked(true);
		if (onSlideLockTriggered) {
			onSlideLockTriggered(pageNumber); // no blob → context will pauseRecording()
		}
	};

	const handleCloseRecordingModal = () => {
		setShowRecordModal(false);
	};

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
								<button
									onClick={toggleLock}
									className={`lock-btn ${isLocked ? "locked" : "unlocked"}`}
									title={
										isLocked
											? autoUnlockReady
												? "Click to unlock and continue"
												: "Locked - answer VC questions to continue"
											: "Slide unlocked"
									}
									disabled={false}
								>
									{isLocked ? (autoUnlockReady ? "🔓✨" : "🔒") : "🔓"}
								</button>
								{isLocked && (
									<span className="lock-status">
										{autoUnlockReady
											? "✅ Click unlock button to continue presentation"
											: "Slide Locked - Answer VC Questions"}
									</span>
								)}
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
				<RecordingStatus
					isRecording={isRecording}
					isPaused={isPaused}
					recordingTime={recordingTime}
				/>

				{/* {currentRecordingSegment && (
					<div className="audio-playback">
						<p>Latest Recording Segment:</p>
						<audio>
							<source
								src={URL.createObjectURL(currentRecordingSegment)}
								type="audio/wav"
							/>
						</audio>
					</div>
				)} */}
			</div>
		</div>
	);
}
