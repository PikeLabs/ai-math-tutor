import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import FeedbackReport from "../components/feedback/FeedbackReport";
import { deleteSessionPdf } from "../services/api";
import { useSession } from "../hooks/useSession";

// import { getTestFeedback } from "../services/api";
const emptyFeedback = {
	feedback_type: "legacy",
	slides: [],
	qa_feedback: null,
	legacy_text: null,
};

// TODO: move to components/student/ since this is the student flow of feedback
export default function FeedbackPage() {
	const { sessionId, getPitchFeedback } = useSession();
	const [feedbackData, setFeedbackData] = useState(emptyFeedback);
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(true);

	const navigate = useNavigate();

	const goBack = () => navigate(-1);

	useEffect(() => {
		const storedFeedback = getPitchFeedback();

		try {
			// TODO: Now that we keep everything in SlideAssets,
			// maybe let's rm the json?
			const structured = storedFeedback?.structured || storedFeedback; // tolerate both shapes

			if (structured?.slides) {
				setFeedbackData(structured);
				setError("");
			} else {
				setError("No feedback found for this session.");
			}
		} catch (error) {
			setError(
				"Oops, something went wrong and we could not generate your feedback..."
			);
			console.error("Error parsing stored feedback:", error);
		} finally {
			setIsLoading(false);
		}
	}, [getPitchFeedback]);

	useEffect(() => {
		if (!sessionId) return;

		(async () => {
			try {
				// TODO: Are there other items on local storage I should remove?
				// TODO: I don't like this being called on every page reload.
				// TODO: Lets think about doing all the cleaning in generate_feedback
				await deleteSessionPdf(sessionId);
			} catch (err) {
				console.warn("PDF cleanup failed (non-blocking)");
			}
		})();
	}, [sessionId]);

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

	let loadingContent = isLoading && (
		<div className="flex items-center justify-center py-6 text-gray-500 text-sm">
			<div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-blue-500 rounded-full mr-2"></div>
			Loading feedback details...
		</div>
	);

	const feedbackContent = !isLoading && (
		<FeedbackReport feedback={feedbackData} />
	);

	const errorContent = error && !isLoading && (
		<div className="text-red-600 text-md font-medium text-center mb-4">
			{error}
		</div>
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
				{errorContent}
				{feedbackContent}
			</div>
		</div>
	);
}
