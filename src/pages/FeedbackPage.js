import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import FeedbackReport from "../components/feedback/FeedbackReport";
import BackButton from "../components/ui/BackButton";
import { getStudentFeedback } from "../services/api";
import { useSession } from "../hooks/useSession";
import { Separator } from "../components/ui/separator";

// import { getTestFeedback } from "../services/api";
const emptyFeedback = {
	feedback_type: "legacy",
	slides: [],
	qa_feedback: null,
	legacy_text: null,
};

export default function FeedbackPage() {
	const { sessionId, clearSession } = useSession();
	const navigate = useNavigate();

	const [feedbackData, setFeedbackData] = useState(emptyFeedback);
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		if (!sessionId) return;

		(async function load() {
			setIsLoading(true);
			setError("");

			try {
				const { feedback } = await getStudentFeedback(sessionId);
				console.log("FEEDBACK RESPONSE:", feedback);
				if (!cancelled) setFeedbackData(feedback);
			} catch (error) {
				if (!cancelled) {
					setError("Failed to load feedback.");
				}
				console.error("Error loading feedback:", error);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [sessionId]);

	const handleStartNewPresentation = () => {
		try {
			clearSession();
		} finally {
			navigate("/student");
		}
	};

	const handleGoHome = () => {
		try {
			clearSession();
		} finally {
			navigate("/");
		}
	};

	const homeButton = !isLoading && <BackButton onClick={handleGoHome} />;
	const newPresentationButton = !isLoading && (
		<BackButton
			onClick={handleStartNewPresentation}
			buttonText="Start New Presentation →"
			ariaLabel="Start New Presentation"
		/>
	);

	let loadingContent = isLoading && (
		<div
			className="flex items-center justify-center py-6 text-sm text-muted-foreground"
			role="status"
		>
			<div className="mr-2 h-5 w-5 rounded-full border-2 border-border border-t-primary animate-spin" />
			Loading feedback details...
		</div>
	);

	const feedbackContent = !isLoading && (
		<FeedbackReport feedback={feedbackData} />
	);

	const errorContent = error && !isLoading && (
		<div className="text-destructive text-sm font-medium text-center mb-4">
			{error}
		</div>
	);

	return (
		<div className="flex flex-col items-center p-4 md:p-6">
			<div className="w-full max-w-5xl">
				<div className="flex justify-between items-center mb-4">
					{homeButton}
					<h1 className="text-xl font-semibold text-center flex-grow">
						Generated Feedback
					</h1>
					{newPresentationButton}
				</div>

				<Separator className="mb-4" />
				{loadingContent}
				{errorContent}
				{feedbackContent}
			</div>
		</div>
	);
}
