import { useState } from "react";

import SlideModal from "../feedback/SlideModal";
import SlideImage from "../feedback/SlideImage";
import { ColumnHeader } from "../ui/Tables";
import { IMAGE_BASE } from "../../constants";

// Note: This is the new Feedback display component, where the session and feedback and slides are passed in as props.
const statusIconMap = {
	met: "✓",
	not_met: "✗",
	not_applicable: "N/A",
	unknown: "?",
};
const statusClassMap = {
	met: "text-emerald-600",
	not_met: "text-red-600",
	not_applicable: "text-gray-500",
	unknown: "text-gray-400",
};

function FeedbackItem({ item, label }) {
	const { status, comment } = item || {};

	const statusKey = status || "unknown";
	const statusColorClass = statusClassMap[statusKey];
	const statusIcon = statusIconMap[statusKey];
	const feedbackComment = comment || "No feedback available";

	return (
		<div className="mb-1.5 p-2 border border-gray-200 rounded-md bg-white">
			<strong className="text-slate-800">{label}: </strong>
			<span className={`font-bold ${statusColorClass}`}>{statusIcon}</span>
			<div className="text-sm leading-relaxed text-slate-600 mt-2">
				{feedbackComment}
			</div>
		</div>
	);
}

function FeedbackContainer({ feedback = {} }) {
	return (
		<>
			<FeedbackItem
				item={feedback.content_structuring}
				label="Content structuring"
			/>
			<FeedbackItem
				item={feedback.delivery}
				label="Delivery"
			/>
			<FeedbackItem
				item={feedback.impromptu_response}
				label="Impromptu response"
			/>
			<FeedbackItem
				item={feedback.composure}
				label="Composure"
			/>
		</>
	);
}

function AudioContainer({ audio_url }) {
	const [audioError, setAudioError] = useState(false);

	const noAudioText = audioError ? "Audio Failed to Load" : "No Audio Segment";

	if (!audio_url || audioError) {
		return (
			<div className="w-[180px] h-10 border border-dashed border-gray-300 rounded flex items-center justify-center text-gray-600 text-xs mx-auto">
				{noAudioText}
			</div>
		);
	}

	const handleAudioError = () => setAudioError(true);
	const audioSrc = `${IMAGE_BASE}${audio_url}`;

	return (
		<div>
			<audio
				controls
				className="w-[180px] mx-auto"
				onError={handleAudioError}
			>
				<source
					src={audioSrc}
					type="audio/mpeg"
				/>
				Your browser does not support the audio element.
			</audio>
			<div className="mt-1 text-[11px] text-gray-600">Audio for this slide</div>
		</div>
	);
}

function ImageContainer({ image_url, alt, onClick }) {
	const [imageError, setImageError] = useState(false);

	const handleImageError = (e) => {
		console.error("Image failed to load:", e);
		setImageError(true);
	};

	const thumbSrc = `${IMAGE_BASE}${image_url}`;

	const errorContent = imageError && (
		<div className="w-full h-full border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-600 text-xs">
			Slide image not available
		</div>
	);

	return (
		<div className="mx-auto flex flex-col justify-center align-center gap-3">
			{!imageError && (
				<SlideImage
					src={thumbSrc}
					alt={alt}
					className="object-contain border-2 border-gray-300 rounded cursor-pointer transition-colors duration-200 hover:border-gray-500"
					onClick={onClick}
					onError={handleImageError}
				/>
			)}
			{errorContent}

			{/* TODO: Only show if the modal is closed? */}
			<div className="mt-1 text-[11px] text-gray-600">
				Click to view full size
			</div>
		</div>
	);
}

function SessionMetaInformation({ hasAudio, hasConversation, feedback }) {
	const qaSegCount = feedback?.metadata?.qa_segments_count || 0;
	const slidesAnalyzed = `📊 ${feedback.slides.length} slides analyzed •`;
	const audioProcessed = hasAudio ? " 🎙️ Audio processed •" : " ⚠️ No audio •";
	const conversationIncluded = hasConversation ? " 💬 Q&A included" : " No Q&A";
	const hasQaAudio = feedback?.metadata?.has_qa_audio;
	const qaAudioInfo = hasQaAudio
		? ` • 🎧 ${qaSegCount} Q&A audio segment${qaSegCount === 1 ? "" : "s"}`
		: "";

	return (
		<>
			<div className="font-bold text-[#1565c0] mb-1.5">Session Information</div>
			<div className="text-sm text-[#1976d2]">
				{slidesAnalyzed}
				{audioProcessed}
				{conversationIncluded}
				{qaAudioInfo}
			</div>
		</>
	);
}

function FeedbackReportDetail({
	feedback,
	audio_url,
	image_url,
	image_url_full,
	slide_number,
	onImageClick,
}) {
	const imageColumnText = `Slide ${slide_number}`;
	const tableDataClass = "p-4 bg-gray-50 text-center";
	const imageParentClass =
		tableDataClass + " flex flex-col justify-between h-full";

	const handleImageClick = () => {
		if (image_url_full) {
			const fullImageSrc = `${IMAGE_BASE}${image_url_full}`;
			onImageClick(fullImageSrc, slide_number);
		}
	};

	return (
		<tr className="border-b border-gray-200">
			{/* Image Column */}
			<td className={imageParentClass}>
				<ColumnHeader title={imageColumnText} />
				<ImageContainer
					image_url={image_url}
					alt={imageColumnText}
					onClick={handleImageClick}
				/>
			</td>

			{/* Feedback Column */}
			{/* TODO: Why do I need ColumnHeader here?!?! */}
			<td className={tableDataClass}>
				<ColumnHeader title="Learning Objectives" />
				<FeedbackContainer feedback={feedback} />
			</td>

			{/* Column 3: Audio Player */}
			<td className={tableDataClass}>
				<ColumnHeader title="Audio Segment" />
				<AudioContainer audio_url={audio_url} />
			</td>
		</tr>
	);
}

function FeedbackReportTableBody({ slides, onImageClick }) {
	return slides.map((slide) => (
		<FeedbackReportDetail
			key={slide.slide_number}
			feedback={slide.feedback}
			audio_url={slide.audio_url}
			image_url={slide.image_url}
			image_url_full={slide.image_url_full}
			slide_number={slide.slide_number}
			onImageClick={onImageClick}
		/>
	));
}

function QAFeedback({ qa }) {
	if (!qa) return null;

	const badge = (status) => {
		const k = status || "unknown";
		const cls = statusClassMap[k];
		const icon = statusIconMap[k];

		return <span className={`ml-2 font-bold ${cls}`}>{icon}</span>;
	};

	const sessionFeedbackText = "Q&A Session Feedback";
	const impromptuResponseIcon = badge(qa.impromptu_response?.status);
	const impromptuResponseComment =
		qa.impromptu_response?.comment || "No comment provided.";
	const composureIcon = badge(qa.composure?.status);
	const composureComment = qa.composure?.comment || "No comment provided.";

	return (
		<div className="mt-6 p-4 bg-[#f8f9fa] rounded border border-[#e9ecef]">
			<h3 className="text-lg font-semibold text-slate-800 border-b-2 border-[#3498db] pb-2 mb-4">
				{sessionFeedbackText}
			</h3>

			<div className="flex flex-col md:flex-row gap-4">
				<div className="flex-1 min-w-[280px] p-4 bg-white rounded border border-gray-200">
					<div className="font-semibold text-slate-800 mb-2 flex items-center">
						<span>Impromptu Response:</span>
						{impromptuResponseIcon}
					</div>
					<div className="text-sm text-slate-600 leading-relaxed">
						{impromptuResponseComment}
					</div>
				</div>

				<div className="flex-1 min-w-[280px] p-4 bg-white rounded border border-gray-200">
					<div className="font-semibold text-slate-800 mb-2 flex items-center">
						<span>Composure:</span>
						{composureIcon}
					</div>
					<div className="text-sm text-slate-600 leading-relaxed">
						{composureComment}
					</div>
				</div>
			</div>
		</div>
	);
}

function LegacyFeedback({ text }) {
	if (!text) return null;

	return (
		<div className="bg-white rounded border border-gray-200 overflow-hidden">
			<div className="bg-yellow-50 text-yellow-800 border border-yellow-300 p-3">
				📝 This is legacy feedback format. New feedback will show as a
				structured table with slide images and audio.
			</div>
			<div className="p-6 whitespace-pre-line text-slate-800">{text}</div>
		</div>
	);
}

/**
 * FeedbackReport
 * Props:
 * - feedback: structured feedback payload
 */
export default function FeedbackReport({ feedback }) {
	const [modalImage, setModalImage] = useState(null);
	const [modalSlideNumber, setModalSlideNumber] = useState(null);
	const [isModalOpen, setIsModalOpen] = useState(false);

	if (!feedback) {
		return (
			<div className="w-full bg-white p-10 rounded border border-gray-200 text-center text-gray-600">
				No feedback available.
			</div>
		);
	}

	if (feedback.feedback_type === "legacy") {
		return (
			<LegacyFeedback
				text={feedback.legacy_text || "No feedback text provided."}
			/>
		);
	}

	const handleImageClick = (imageUrl, slideNumber) => {
		setModalImage(imageUrl);
		setModalSlideNumber(slideNumber);
		setIsModalOpen(true);
	};

	const handleCloseModal = () => {
		setIsModalOpen(false);
		setModalImage(null);
		setModalSlideNumber(null);
	};

	const slides = feedback.slides || [];
	const hasSlides = slides.length > 0;
	const hasAudio = !!feedback?.metadata?.has_audio;
	const hasConversation = !!feedback?.metadata?.has_conversation;

	return (
		<div className="bg-white rounded border border-gray-200 overflow-hidden">
			{/* Session Info (metadata) Banner */}
			<div className="bg-[#e3f2fd] p-4 border-b border-[#90caf9]">
				<SessionMetaInformation
					hasAudio={hasAudio}
					hasConversation={hasConversation}
					feedback={feedback}
				/>
			</div>

			{hasSlides && (
				<table className="w-full border-collapse">
					<thead>
						<tr className="bg-gray-50 border-b border-gray-200">
							<th className="px-4 py-3 text-center font-semibold text-slate-600 w-[220px]">
								Slide
							</th>
							<th className="px-4 py-3 text-center font-semibold text-slate-600">
								Learning Objectives Feedback
							</th>
							<th className="px-4 py-3 text-center font-semibold text-slate-600 w-[220px]">
								Audio
							</th>
						</tr>
					</thead>

					<tbody>
						<FeedbackReportTableBody
							slides={slides}
							onImageClick={handleImageClick}
						/>
					</tbody>
				</table>
			)}

			{!hasSlides && (
				<div className="p-8 text-center text-gray-600">
					No slide feedback available.
				</div>
			)}

			<QAFeedback qa={feedback.qa_feedback} />

			<div className="mt-8 text-sm text-gray-600 text-center p-5 bg-white rounded-md border border-gray-200">
				This feedback was generated based on your pitch presentation and Q&A
				conversation.
			</div>

			<SlideModal
				imageUrl={modalImage}
				slideNumber={modalSlideNumber}
				isOpen={isModalOpen}
				onClose={handleCloseModal}
			/>
		</div>
	);
}
