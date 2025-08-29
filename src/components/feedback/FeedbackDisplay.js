import { useState } from "react";
import SlideRow from "./SlideRow";
import SlideModal from "./SlideModal";

function SessionInformation({ slides, hasAudio, hasConversation, data }) {
	const slidesAnalyzed = `📊 ${slides.length} slides analyzed •`;
	const audioProcessed = hasAudio
		? " 🎙️ Audio processed  •"
		: " ⚠️ No audio  •";
	const qaIncluded = hasConversation ? " 💬 Q&A included" : " No Q&A";
	const qaSegmentCount = data?.metadata?.qa_segments_count || 0;
	const audioSegments =
		data?.metadata?.has_qa_audio ??
		` • 🎧 ${qaSegmentCount} Q&A audio segment${qaSegmentCount > 1 ? "" : "s"}`;

	return (
		<>
			<div
				style={{
					fontWeight: "bold",
					color: "#1565c0",
					marginBottom: "5px",
				}}
			>
				Session Information
			</div>
			<div style={{ fontSize: "14px", color: "#1976d2" }}>
				{slidesAnalyzed}
				{audioProcessed}
				{qaIncluded}
				{audioSegments}
			</div>
		</>
	);
}

/**
 * Props:
 * - data: either structured (with slides, metadata, qa_feedback) or legacy ({ feedback_type:'legacy', legacy_text })
 * - readOnly?: boolean  // hides back/test buttons if true
 * - onBack?: () => void
 * - onLoadTest?: () => void
 */
export default function FeedbackDisplay({
	data,
	readOnly = false,
	onBack,
	onLoadTest,
}) {
	const [modalImage, setModalImage] = useState(null);
	const [modalSlideNumber, setModalSlideNumber] = useState(null);
	const [isModalOpen, setIsModalOpen] = useState(false);

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

	const renderQAFeedback = (qaFeedback) => {
		if (!qaFeedback) return null;

		const getStatusIcon = (status) => {
			switch (status) {
				case "met":
					return "✓";
				case "not_met":
					return "✗";
				case "not_applicable":
					return "N/A";
				default:
					return "?";
			}
		};
		const getStatusColor = (status) => {
			switch (status) {
				case "met":
					return "#27ae60";
				case "not_met":
					return "#e74c3c";
				case "not_applicable":
					return "#7f8c8d";
				default:
					return "#95a5a6";
			}
		};

		return (
			<div
				style={{
					marginTop: "30px",
					padding: "20px",
					backgroundColor: "#f8f9fa",
					borderRadius: "8px",
					border: "1px solid #e9ecef",
				}}
			>
				<h3
					style={{
						color: "#2c3e50",
						borderBottom: "2px solid #3498db",
						paddingBottom: "8px",
						marginBottom: "15px",
					}}
				>
					Q&A Session Feedback
				</h3>

				<div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
					<div
						style={{
							flex: "1",
							minWidth: "300px",
							padding: "15px",
							backgroundColor: "#fff",
							borderRadius: "6px",
							border: "1px solid #e0e0e0",
						}}
					>
						<div
							style={{
								fontWeight: "bold",
								marginBottom: "8px",
								display: "flex",
								alignItems: "center",
							}}
						>
							<span style={{ color: "#2c3e50", marginRight: "10px" }}>
								Impromptu Response:
							</span>
							<span
								style={{
									color: getStatusColor(qaFeedback.impromptu_response.status),
									fontSize: "18px",
									fontWeight: "bold",
								}}
							>
								{getStatusIcon(qaFeedback.impromptu_response.status)}
							</span>
						</div>
						<div style={{ color: "#555", lineHeight: "1.4", fontSize: "14px" }}>
							{qaFeedback.impromptu_response.comment}
						</div>
					</div>

					<div
						style={{
							flex: "1",
							minWidth: "300px",
							padding: "15px",
							backgroundColor: "#fff",
							borderRadius: "6px",
							border: "1px solid #e0e0e0",
						}}
					>
						<div
							style={{
								fontWeight: "bold",
								marginBottom: "8px",
								display: "flex",
								alignItems: "center",
							}}
						>
							<span style={{ color: "#2c3e50", marginRight: "10px" }}>
								Composure:
							</span>
							<span
								style={{
									color: getStatusColor(qaFeedback.composure.status),
									fontSize: "18px",
									fontWeight: "bold",
								}}
							>
								{getStatusIcon(qaFeedback.composure.status)}
							</span>
						</div>
						<div style={{ color: "#555", lineHeight: "1.4", fontSize: "14px" }}>
							{qaFeedback.composure.comment}
						</div>
					</div>
				</div>
			</div>
		);
	};

	const renderLegacyFeedback = (legacyText) => (
		<div
			style={{
				backgroundColor: "#f8f9fa",
				padding: "30px",
				borderRadius: "8px",
				border: "1px solid #e9ecef",
				fontSize: "16px",
				color: "#333",
				whiteSpace: "pre-line",
			}}
		>
			{legacyText}
		</div>
	);

	// Top controls (hide in readOnly)
	const Controls = () => (
		<div style={{ marginBottom: "20px" }}>
			{!readOnly && (
				<>
					<button
						onClick={onBack}
						style={{
							padding: "10px 20px",
							backgroundColor: "#007bff",
							color: "white",
							border: "none",
							borderRadius: "5px",
							cursor: "pointer",
							fontSize: "14px",
							marginRight: "10px",
						}}
					>
						← Back to Chat
					</button>
					<button
						onClick={onLoadTest}
						style={{
							padding: "10px 20px",
							backgroundColor: "#28a745",
							color: "white",
							border: "none",
							borderRadius: "5px",
							cursor: "pointer",
							fontSize: "14px",
						}}
					>
						Load Test Feedback
					</button>
				</>
			)}
		</div>
	);

	if (!data) {
		return (
			<div
				style={{
					backgroundColor: "#fff",
					padding: 40,
					borderRadius: 8,
					border: "1px solid #e9ecef",
					textAlign: "center",
					color: "#666",
				}}
			>
				No feedback available.
			</div>
		);
	}

	const isLegacy = data.feedback_type === "legacy";
	const slides = data.slides || [];
	const hasAudio = !!data?.metadata?.has_audio;
	const hasConversation = !!data?.metadata?.has_conversation;

	return (
		<div
			style={{
				padding: "20px",
				fontFamily: "Arial, sans-serif",
				backgroundColor: "#f5f5f5",
			}}
		>
			<Controls />

			<h1 style={{ color: "#333", marginBottom: "30px", textAlign: "center" }}>
				Pitch Feedback Report
			</h1>

			{isLegacy ? (
				renderLegacyFeedback(data.legacy_text)
			) : (
				<div>
					{/* Metadata */}
					<div
						style={{
							backgroundColor: "#e3f2fd",
							padding: "15px",
							borderRadius: "6px",
							marginBottom: "20px",
							border: "1px solid #90caf9",
						}}
					>
						<SessionInformation
							slides={slides}
							hasAudio={hasAudio}
							hasConversation={hasConversation}
							data={data}
						/>
					</div>

					{/* Slides Table */}
					{slides.length > 0 ? (
						<div
							style={{
								backgroundColor: "#fff",
								borderRadius: "8px",
								border: "1px solid #e9ecef",
								overflow: "hidden",
							}}
						>
							<table style={{ width: "100%", borderCollapse: "collapse" }}>
								<thead>
									<tr
										style={{
											backgroundColor: "#f8f9fa",
											borderBottom: "2px solid #dee2e6",
										}}
									>
										<th
											style={{
												padding: 15,
												textAlign: "center",
												fontWeight: "bold",
												color: "#495057",
												width: 200,
											}}
										>
											Slide
										</th>
										<th
											style={{
												padding: 15,
												textAlign: "center",
												fontWeight: "bold",
												color: "#495057",
											}}
										>
											Learning Objectives Feedback
										</th>
										<th
											style={{
												padding: 15,
												textAlign: "center",
												fontWeight: "bold",
												color: "#495057",
												width: 200,
											}}
										>
											Audio
										</th>
									</tr>
								</thead>
								<tbody>
									{slides.map((slideData) => (
										<SlideRow
											key={slideData.slide_number}
											slideData={slideData}
											onImageClick={handleImageClick}
										/>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<div
							style={{
								backgroundColor: "#fff",
								padding: 40,
								borderRadius: 8,
								border: "1px solid #e9ecef",
								textAlign: "center",
								color: "#666",
							}}
						>
							No slide feedback available.
						</div>
					)}

					{/* Q&A Feedback */}
					{renderQAFeedback(data.qa_feedback)}
				</div>
			)}

			<div
				style={{
					marginTop: "30px",
					fontSize: "14px",
					color: "#666",
					textAlign: "center",
					padding: "20px",
					backgroundColor: "#fff",
					borderRadius: "6px",
					border: "1px solid #e9ecef",
				}}
			>
				This feedback was generated based on your pitch presentation and Q&A
				conversation.
			</div>

			{/* Modal for full-size slide viewing */}
			<SlideModal
				imageUrl={modalImage}
				slideNumber={modalSlideNumber}
				isOpen={isModalOpen}
				onClose={handleCloseModal}
			/>
		</div>
	);
}
