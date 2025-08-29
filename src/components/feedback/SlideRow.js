import { useState } from "react";
import SlideImage from "./SlideImage";
import { IMAGE_BASE } from "../../constants";

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

function StatusItem({ feedbackItem, label }) {
	const { status, comment } = feedbackItem || {};

	const statusColorClass = statusClassMap[status || "unknown"];
	const statusIcon = statusIconMap[status || ""];
	const feedbackComment = comment || "No feedback available";

	return (
		<div className="mb-1.5 p-2 border border-gray-200 rounded-md bg-white">
			<strong className="text-slate-800">{label}: </strong>
			<span className={`font-bold ${statusColorClass}`}>{statusIcon}</span>
			<div className="text-sm leading-relaxed text-slate-600 mt-1">
				{feedbackComment}
			</div>
		</div>
	);
}

function SlideRow({ slideData, onImageClick }) {
	console.log("Image BASE:", IMAGE_BASE);
	const [audioError, setAudioError] = useState(false);
	const [imageError, setImageError] = useState(false);

	const handleImageClick = () => {
		const fullImageUrl = `${IMAGE_BASE}${slideData.image_url_full}`;
		onImageClick(fullImageUrl, slideData.slide_number);
	};

	const handleImageError = (e) => {
		console.error("Image failed to load:", e);
		setImageError(true);
	};

	const handleAudioError = () => {
		setAudioError(true);
	};

	const thumbSrc = `${IMAGE_BASE}${slideData.image_url}`;
	const fullSrc = `${IMAGE_BASE}${slideData.image_url_full}`;
	const audioSrc = slideData?.audio_url
		? `{IMAGE_BASE}${slideData.audio_url}`
		: null;

	const { feedback } = slideData;
	const onMouseOver = (e) => (e.target.style.borderColor = "#3498db");
	const onMouseOut = (e) => (e.target.style.borderColor = "#ddd");

	return (
		<tr style={{ borderBottom: "1px solid #e0e0e0" }}>
			{/* Slide cell (thumbnail) */}
			<td className="p-4 align-top w-[200px] text-center">
				<div className="mb-2 font-medium text-gray-700">
					Slide {slideData.slide_number}
				</div>

				<div className="w-[180px] h-[120px] mx-auto flex items-center justify-center">
					{!imageError ? (
						<SlideImage
							src={thumbSrc}
							alt={`Slide ${slideData.slide_number}`}
							className="h-full object-contain border-2 border-gray-300 rounded cursor-pointer transition-colors duration-200 hover:border-gray-500"
							onClick={handleImageClick}
							onError={handleImageError}
							onMouseOver={onMouseOver}
							onMouseOut={onMouseOut}
						/>
					) : (
						<div className="w-full h-full border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-600 text-xs">
							Slide image not available
						</div>
					)}
				</div>

				<div className="mt-1 text-[11px] text-gray-600">
					Click to view full size
				</div>
			</td>

			{/* Column 2: Feedback */}
			<td
				style={{
					padding: "15px",
					verticalAlign: "top",
					backgroundColor: "#f8f9fa",
				}}
			>
				<div
					style={{ marginBottom: "10px", fontWeight: "bold", color: "#2c3e50" }}
				>
					Learning Objectives
				</div>
				<>
					<StatusItem
						feedbackItem={feedback.content_structuring}
						label="Content structuring"
					/>
					<StatusItem
						feedbackItem={feedback.delivery}
						label="Delivery"
					/>
					<StatusItem
						feedbackItem={feedback.impromptu_response}
						label="Impromptu response"
					/>
					<StatusItem
						feedbackItem={feedback.composure}
						label="Composure"
					/>
				</>
			</td>

			{/* Column 3: Audio Player */}
			<td
				style={{
					padding: "15px",
					verticalAlign: "top",
					width: "200px",
					textAlign: "center",
				}}
			>
				<div
					style={{ marginBottom: "10px", fontWeight: "bold", color: "#2c3e50" }}
				>
					Audio Segment
				</div>
				{slideData.audio_url && !audioError ? (
					<div>
						<audio
							controls
							style={{
								width: "100%",
								maxWidth: "180px",
							}}
							onError={handleAudioError}
						>
							<source
								src={`http://localhost:5001${slideData.audio_url}`}
								type="audio/wav"
							/>
							Your browser does not support the audio element.
						</audio>
						<div style={{ marginTop: "5px", fontSize: "11px", color: "#666" }}>
							Audio for this slide
						</div>
					</div>
				) : (
					<div
						style={{
							width: "180px",
							height: "40px",
							border: "1px dashed #ccc",
							borderRadius: "4px",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "#666",
							fontSize: "12px",
							margin: "0 auto",
						}}
					>
						{audioError ? "Audio not available" : "No audio segment"}
					</div>
				)}
			</td>
		</tr>
	);
}

export default SlideRow;
