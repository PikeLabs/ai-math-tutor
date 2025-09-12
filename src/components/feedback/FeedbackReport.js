import { useState } from "react";

import SlideModal from "./SlideModal";
import SlideImage from "./SlideImage";
import {
	resolveUrl,
	parseTranscriptText,
	buildStructuredTranscript,
} from "../../utils";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

function getSlideKey(slide) {
	const parts = [
		"slide",
		slide?.slide_number,
		// include URLs if present to disambiguate duplicate slide_number entries
		slide?.image_url_full || slide?.image_url || "",
		slide?.audio_url || "",
	];
	// Use ":" so it's obvious and stable
	return parts.filter(Boolean).join(":");
}

const keys = [
	"content_structuring",
	"delivery",
	"impromptu_response",
	"composure",
];

function OverallBadge({ feedback }) {
	if (!feedback) return null;

	let met = 0,
		considered = 0;

	for (const k of keys) {
		const s = feedback?.[k]?.status;
		if (!s || s === "not_applicable") continue;
		considered += 1;
		if (s === "met") met += 1;
	}

	const text = considered ? `${met}/${considered} met` : "No score";
	const solidPass = considered > 0 && met / considered >= 0.5;

	// Use badge variants for simple “traffic light” feel
	const variant = !considered
		? "secondary"
		: solidPass
		? "default"
		: "destructive";

	return (
		<Badge
			variant={variant}
			className="font-semibold"
		>
			Overall: {text}
		</Badge>
	);
}

function TranscriptPanel({ text, structured }) {
	// Accept either raw text or pre-built structure
	const data = structured || parseTranscriptText(text);

	if (!data.ordered.length) {
		return (
			<div className="w-full rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
				Conversation transcript not available
			</div>
		);
	}

	return (
		<div className="rounded-md border border-border bg-card p-3 md:p-4">
			<div className="space-y-4">
				{data.ordered.map(({ speaker, paragraphs }, idx) => (
					<div
						key={idx}
						className="rounded-lg border border-border bg-muted/30 p-3"
					>
						<div className="text-sm leading-relaxed text-foreground">
							<span className="font-semibold">
								{speaker}
								<span className="opacity-60">:</span>{" "}
							</span>
							<span className="align-baseline text-foreground/80">
								{paragraphs[0] || ""}
							</span>
						</div>

						{paragraphs.slice(1).map((para, i) => (
							<p
								key={i}
								className="mt-2 text-sm leading-relaxed text-foreground/80"
							>
								{para}
							</p>
						))}
					</div>
				))}
			</div>
		</div>
	);
}

function SlideSection({ slide, structuredFallback, onImageClick }) {
	const {
		slide_number,
		image_url,
		image_url_full,
		audio_url,
		feedback,
		qa_transcript, // NEW from backend
	} = slide || {};

	const imageColumnText = `Slide ${slide_number}`;
	const structuredTranscript = qa_transcript
		? parseTranscriptText(qa_transcript)
		: structuredFallback;

	const handleImageClick = () => {
		if (image_url_full) {
			const fullImageSrc = resolveUrl(image_url_full);
			onImageClick(fullImageSrc, slide_number);
		}
	};

	return (
		<section className="border-b border-border p-4 md:p-6">
			{/* Header row */}
			<div className="mb-3 flex items-center justify-between">
				<div className="text-base font-semibold text-foreground">
					{imageColumnText}
				</div>
				<div className="flex items-center gap-3">
					<OverallBadge feedback={feedback} />
					<div className="hidden md:block">
						<AudioContainer audio_url={audio_url} />
					</div>
				</div>
			</div>

			{/* Audio (mobile) */}
			<div className="md:hidden mb-3">
				<AudioContainer audio_url={audio_url} />
			</div>

			{/* Two-column layout */}
			<div className="grid grid-cols-1 gap-4 md:grid-cols-5">
				{/* Left (col 1): Image + Feedback */}
				<div className="md:col-span-2 space-y-4">
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm">Slide Image</CardTitle>
						</CardHeader>
						<CardContent className="pt-0">
							<ImageContainer
								image_url={image_url}
								alt={imageColumnText}
								onClick={handleImageClick}
								slide_number={slide_number}
							/>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm">Feedback</CardTitle>
						</CardHeader>
						<CardContent className="pt-0">
							<FeedbackContainer feedback={feedback} />
						</CardContent>
					</Card>
				</div>

				{/* Right (col 2): Transcript — intentionally wider (spans 3) */}
				<div className="md:col-span-3">
					<Card className="h-full">
						<CardHeader className="pb-2">
							<CardTitle className="text-sm">
								Conversation (Q&amp;A) Transcript
							</CardTitle>
						</CardHeader>
						<CardContent className="pt-0">
							<TranscriptPanel structured={structuredTranscript} />
						</CardContent>
					</Card>
				</div>
			</div>
		</section>
	);
}

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
		<div className="mb-2 rounded-md border border-border bg-card/50 p-3">
			<div className="text-sm font-medium font-bold text-foreground">
				{label}:{" "}
				<span className={`ml-1 font-bold ${statusColorClass}`}>
					{statusIcon}
				</span>
			</div>

			<div className="mt-1.5 text-sm leading-relaxed text-foreground/80">
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
			<div className="mx-auto flex h-10 w-[180px] items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">
				{noAudioText}
			</div>
		);
	}

	const handleAudioError = () => setAudioError(true);
	const audioSrc = resolveUrl(audio_url);

	return (
		<div>
			<audio
				controls
				className="mx-auto w-[180px]"
				onError={handleAudioError}
			>
				<source src={audioSrc} />
				Your browser does not support the audio element.
			</audio>

			<div className="mt-1 text-[11px] text-muted-foreground">
				Audio for this slide
			</div>
		</div>
	);
}

function ImageContainer({ image_url, alt, onClick }) {
	const [imageError, setImageError] = useState(false);

	const imageAvailable = image_url && !imageError;
	if (!imageAvailable) {
		return (
			<div className="flex h-full w-full items-center justify-center rounded border-2 border-dashed border-border text-xs text-muted-foreground">
				Slide image not available
			</div>
		);
	}

	const clickToView = imageAvailable && (
		<div className="mt-1 text-[11px] text-muted-foreground">
			Click to view full size
		</div>
	);

	const handleImageError = (e) => {
		setImageError(true);
	};

	return (
		<div className="mx-auto flex flex-col items-center justify-center gap-3">
			<SlideImage
				src={image_url}
				alt={alt}
				className="cursor-pointer rounded border border-border object-contain transition-colors duration-200 hover:border-foreground/40"
				onClick={onClick}
				onError={handleImageError}
			/>

			{clickToView}
		</div>
	);
}

function SessionMetaInformation({ hasAudio, hasConversation, feedback }) {
	const slideCount =
		feedback?.metadata?.slide_count ?? feedback?.slides?.length ?? 0;
	const qaSegCount = feedback?.metadata?.qa_segments_count || 0;
	const slidesAnalyzed = `📊 ${slideCount} slides analyzed •`;
	const audioProcessed = hasAudio ? " 🎙️ Audio processed •" : " ⚠️ No audio •";
	const conversationIncluded = hasConversation ? " 💬 Q&A included" : " No Q&A";
	const hasQaAudio = feedback?.metadata?.has_qa_audio;
	const qaAudioInfo = hasQaAudio
		? ` • 🎧 ${qaSegCount} Q&A audio segment${qaSegCount === 1 ? "" : "s"}`
		: "";

	return (
		<>
			<div className="mb-1.5 text-sm font-semibold text-foreground">
				Session Information
			</div>
			{feedback?.overall?.text && (
				<span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium bg-emerald-100 text-emerald-700">
					Overall Score: {feedback.overall.score} ({feedback.overall.text})
				</span>
			)}
			<div className="text-sm text-muted-foreground">
				{slidesAnalyzed}
				{audioProcessed}
				{conversationIncluded}
				{qaAudioInfo}
			</div>
		</>
	);
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
		<div className="mt-6 rounded border border-border bg-muted/40 p-4">
			<h3 className="mb-4 border-b border-border pb-2 text-base font-semibold text-foreground">
				{sessionFeedbackText}
			</h3>

			<div className="flex flex-col gap-4 md:flex-row">
				<div className="flex-1 min-w-[280px] rounded-md border border-border bg-card p-4">
					<div className="text-sm font-medium">
						Impromptu Response: {impromptuResponseIcon}
					</div>
					<div className="mt-1.5 text-sm leading-relaxed text-foreground/80">
						{impromptuResponseComment}
					</div>
				</div>

				<div className="flex-1 min-w-[280px] rounded-md border border-border bg-card p-4">
					<div className="text-sm font-medium">Composure: {composureIcon}</div>
					<div className="mt-1.5 text-sm leading-relaxed text-foreground/80">
						{composureComment}
					</div>
				</div>
			</div>
		</div>
	);
}

// TODO: Do we still want this?
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
			<div className="w-full rounded border border-border bg-card p-10 text-center text-muted-foreground">
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
	const structuredFallback = buildStructuredTranscript(feedback);
	const seen = new Map();
	for (const s of slides) {
		const n = s?.slide_number;
		if (typeof n === "number") {
			seen.set(n, (seen.get(n) || 0) + 1);
		}
	}
	const dupes = [...seen.entries()]
		.filter(([, count]) => count > 1)
		.map(([n]) => n);
	if (dupes.length) {
		// eslint-disable-next-line no-console
		console.warn("Feedback payload contains duplicate slide_number(s):", dupes);
	}

	return (
		<Card className="overflow-hidden">
			{/* Session Info (metadata) Banner */}
			<div className="border-b border-border bg-muted/50 p-4">
				<SessionMetaInformation
					hasAudio={hasAudio}
					hasConversation={hasConversation}
					feedback={feedback}
				/>
			</div>

			{hasSlides && (
				<div>
					{slides.map((slide) => (
						<SlideSection
							key={getSlideKey(slide)}
							slide={slide}
							fallbackTranscript={structuredFallback}
							onImageClick={handleImageClick}
						/>
					))}
				</div>
			)}

			{!hasSlides && (
				<div className="p-8 text-center text-muted-foreground">
					No slide feedback available.
				</div>
			)}

			<QAFeedback qa={feedback.qa_feedback} />

			<div className="m-5 pt-5 text-center text-xs text-muted-foreground">
				This feedback was generated based on your pitch presentation and Q&A
				conversation.
			</div>

			<SlideModal
				imageUrl={modalImage}
				slideNumber={modalSlideNumber}
				isOpen={isModalOpen}
				onClose={handleCloseModal}
			/>
		</Card>
	);
}
