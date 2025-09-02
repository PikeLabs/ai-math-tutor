import { IMAGE_BASE } from "../constants";

export function convertDbFeedbackToDisplay(feedback) {
	if (!feedback) return null;

	// Helper: is it plausibly JSON?
	const looksJson = (s) => {
		if (typeof s !== "string") return false;
		const first = s.trim().charAt(0);
		return first === "{" || first === "[";
	};

	// Try to normalize slideFeedback into an object if possible.
	const coerceSlideFeedback = (sf) => {
		// Already an object?
		if (sf && typeof sf === "object") return sf;

		// Only attempt parse if it looks like JSON
		if (looksJson(sf)) {
			try {
				let parsed = JSON.parse(sf);
				// Handle double-encoded JSON strings ("{\"slides\":...}" as a string)
				if (typeof parsed === "string" && looksJson(parsed)) {
					parsed = JSON.parse(parsed);
				}
				if (parsed && typeof parsed === "object") return parsed;
			} catch {
				// swallow — we'll fall back to legacy view
			}
		}

		return null; // not JSON
	};

	// 1) Try JSON in slideFeedback (string or object)
	const parsed = coerceSlideFeedback(feedback.slideFeedback);
	if (parsed) {
		const slides = Array.isArray(parsed.slides) ? parsed.slides : [];
		return {
			feedback_type: parsed.feedback_type || "per_slide",
			slides,
			qa_feedback: parsed.qa_feedback ?? null,
			metadata: parsed.metadata ?? {
				slide_count: slides.length,
				has_audio: slides.some((s) => !!s?.audio_url),
				has_conversation: !!parsed.qa_feedback,
			},
		};
	}

	// 2) Sometimes server may stash pre-structured object
	if (feedback.structured && typeof feedback.structured === "object") {
		const s = feedback.structured;
		const slides = Array.isArray(s.slides) ? s.slides : [];
		return {
			feedback_type: s.feedback_type || "per_slide",
			slides,
			qa_feedback: s.qa_feedback ?? null,
			metadata: s.metadata ?? {
				slide_count: slides.length,
				has_audio: slides.some((sl) => !!sl?.audio_url),
				has_conversation: !!s.qa_feedback,
			},
		};
	}

	// 3) Legacy fallback (raw text fields)
	const parts = [];
	if (feedback.presentationScore != null) {
		parts.push(`Presentation Score: ${feedback.presentationScore}`);
	}
	if (feedback.overallFeedback) {
		parts.push(`\nOverall Feedback:\n${feedback.overallFeedback}`);
	}
	if (feedback.slideFeedback) {
		// Show raw string for visibility if it's not JSON
		parts.push(`\nSlide Feedback:\n${String(feedback.slideFeedback)}`);
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

// helper to resolve absolute or relative URL
export function resolveUrl(pathOrUrl) {
	if (!pathOrUrl) return null;
	const isAbs = /^https?:\/\//i.test(pathOrUrl);
	return isAbs ? pathOrUrl : `${IMAGE_BASE}${pathOrUrl}`;
}
