import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import FeedbackReport from "../components/feedback/FeedbackReport";
import { deleteSessionPdf } from "../services/api";
import { useSession } from "../hooks/useSession";

// import { getTestFeedback } from "../services/api";

export default function FeedbackPage() {
	const [feedbackData, setFeedbackData] = useState(null);
	const [isLoading, setIsLoading] = useState(true);

	const { sessionId } = useSession();
	const navigate = useNavigate();

	const goBack = () => navigate(-1);

	// const handleLoadTestFeedback = async () => {
	// 	try {
	// 		const data = await getTestFeedback();
	// 		if (data?.feedback) {
	// 			const legacyData = {
	// 				feedback_type: "legacy",
	// 				slides: [],
	// 				qa_feedback: null,
	// 				legacy_text: data.feedback,
	// 			};
	// 			localStorage.setItem("pitchFeedback", JSON.stringify(legacyData));
	// 			setFeedbackData(legacyData);
	// 		}
	// 	} catch (error) {
	// 		console.error("Error loading test feedback:", error);
	// 	}
	// };

	useEffect(() => {
		const storedFeedback = localStorage.getItem("pitchFeedback");
		try {
			const parsed = JSON.parse(storedFeedback);
			const structured = parsed?.structured || parsed; // tolerate both shapes

			if (structured?.slides) {
				setFeedbackData(structured);
			} else {
				setFeedbackData({
					feedback_type: "legacy",
					slides: [],
					qa_feedback: null,
					legacy_text: storedFeedback,
				});
			}
		} catch (error) {
			setFeedbackData({
				feedback_type: "legacy",
				slides: [],
				qa_feedback: null,
				legacy_text: storedFeedback,
			});
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		const prevUploadId = localStorage.getItem("currentPDFUploadId");
		if (!sessionId || !prevUploadId) return;

		(async () => {
			try {
				await deleteSessionPdf(sessionId, prevUploadId);
				localStorage.removeItem("currentPDFUploadId");
			} catch (err) {
				console.warn("PDF cleanup failed (non-blocking)");
			}
		})();
	}, []);

	let loadingContent = isLoading && (
		<div className="flex items-center justify-center py-6 text-gray-500 text-sm">
			<div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-blue-500 rounded-full mr-2"></div>
			Loading feedback details...
		</div>
	);

	// TODO: Do we want a back button in this page?
	const backButton = !isLoading && (
		<button
			type="button"
			onClick={goBack}
			className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
		>
			← Back to Chat
		</button>
	);

	const feedbackContent = !isLoading && (
		<FeedbackReport feedback={feedbackData} />
	);

	return (
		<div className="flex flex-col items-center p-2">
			<div className="w-full max-w-5xl">
				<div className="flex justify-between items-center mb-4">
					<h1 className="text-xl font-semibold text-center flex-grow">
						Generated Feedback
					</h1>
				</div>
				{loadingContent}
				{feedbackContent}
			</div>
		</div>
	);
}
