export function convertDbFeedbackToDisplay(feedback) {
	// TODO: Render DB feedback as "legacy" text for now, so it shows in the same UI.
	// Enhance this later to a fully structured object if you store slides, qa, etc. in DB.
	const parts = [];
	if (feedback.presentationScore != null) {
		parts.push(`Presentation Score: ${feedback.presentationScore}`);
	}
	if (feedback.overallFeedback) {
		parts.push(`\nOverall Feedback:\n${feedback.overallFeedback}`);
	}
	if (feedback.slideFeedback) {
		parts.push(`\nSlide Feedback:\n${feedback.slideFeedback}`);
	}
	if (feedback.strengths) {
		parts.push(`\nStrengths:\n${feedback.strengths}`);
	}
	if (feedback.improvements) {
		parts.push(`\nImprovements:\n${feedback.improvements}`);
	}

	const text = parts.join("\n").trim();

	return {
		feedback_type: "legacy",
		slides: [],
		qa_feedback: null,
		legacy_text: text || "No feedback text provided.",
	};
}
