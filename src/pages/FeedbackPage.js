import { useEffect, useState } from "react";
import FeedbackReport from "../components/feedback/FeedbackReport";
// import { getTestFeedback } from "../services/api"; // Adjust the import path as needed

export default function FeedbackPage() {
	const [feedbackData, setFeedbackData] = useState(null);
	const [loading, setLoading] = useState(true);

	const goBack = () => window.history.back();

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
			setLoading(false);
		}
	}, []);

	if (loading) {
		return (
			<div className="p-6">
				<h1>Loading Feedback...</h1>
			</div>
		);
	}

	return (
		<div className="flex justify-center p-2">
			<div className="w-full max-w-5xl">
				<h1 className="text-xl font-semibold mb-4 text-center">
					Generated Feedback
				</h1>
				<FeedbackReport feedback={feedbackData} />
			</div>
		</div>
	);
}
