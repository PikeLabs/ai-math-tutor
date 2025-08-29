/**
 * Normalize DB feedback into the shape FeedbackReport expects.
 * Priority:
 * 1) feedback.slideFeedback (JSON string from API)
 * 2) feedback.structured   (already-parsed, from student/localStorage flow)
 * 3) legacy text fallback  (your current behavior)
 */
export function convertDbFeedbackToDisplay(feedback) {
	if (!feedback) return null;

	// 1) Server sends JSON string in slideFeedback
	if (
		typeof feedback.slideFeedback === "string" &&
		feedback.slideFeedback.trim()
	) {
		try {
			const parsed = JSON.parse(feedback.slideFeedback);

			// Ensure required keys exist
			return {
				feedback_type: parsed.feedback_type || "per_slide",
				slides: Array.isArray(parsed.slides) ? parsed.slides : [],
				qa_feedback: parsed.qa_feedback ?? null,
				metadata: parsed.metadata ?? {
					slide_count: Array.isArray(parsed.slides) ? parsed.slides.length : 0,
					has_audio: !!parsed.slides?.some((s) => !!s.audio_url),
					has_conversation: !!parsed.qa_feedback,
				},
			};
		} catch (e) {
			// Fall through to legacy if JSON is malformed
			console.error("Failed to parse slideFeedback JSON:", e);
		}
	}

	// 2) Student flow sometimes stores a ready-to-use object at `structured`
	if (feedback.structured && typeof feedback.structured === "object") {
		const s = feedback.structured;
		return {
			feedback_type: s.feedback_type || "per_slide",
			slides: Array.isArray(s.slides) ? s.slides : [],
			qa_feedback: s.qa_feedback ?? null,
			metadata: s.metadata ?? {
				slide_count: Array.isArray(s.slides) ? s.slides.length : 0,
				has_audio: !!s.slides?.some((sl) => !!sl.audio_url),
				has_conversation: !!s.qa_feedback,
			},
		};
	}

	// 3) Legacy fallback (your current behavior)
	const parts = [];
	if (feedback.presentationScore != null) {
		parts.push(`Presentation Score: ${feedback.presentationScore}`);
	}
	if (feedback.overallFeedback) {
		parts.push(`\nOverall Feedback:\n${feedback.overallFeedback}`);
	}
	if (feedback.slideFeedback) {
		// Keep raw string for visibility if parsing failed / non-standard
		parts.push(`\nSlide Feedback:\n${feedback.slideFeedback}`);
	}
	if (feedback.strengths) {
		parts.push(`\nStrengths:\n${feedback.strengths}`);
	}
	if (feedback.improvements) {
		parts.push(`\nImprovements:\n${feedback.improvements}`);
	}
	const legacy_text = parts.join("\n").trim() || "No feedback text provided.";

	return {
		feedback_type: "legacy",
		slides: [],
		qa_feedback: null,
		metadata: { slide_count: 0, has_audio: false, has_conversation: false },
		legacy_text,
	};
}
