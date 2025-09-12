export const buildFollowUpContext = (currentSlideRange) => {
	// const { start, end } = currentSlideRange || {};
	// const rangeText = start === end ? `slide ${start}` : `slides ${start}-${end}`;
	// 	return `Based on my previous answer, ask me one final follow-up question about ${rangeText}. This is the final question.`;
	return "Ask me one final, high-leverage follow-up question about the overall pitch (not tied to any specific slide). Keep it concise. This is the final question.";
};

export const buildEnhancedContext = (
	slideData,
	slideRange,
	audioSegment,
	questionNumber,
	selectedAssignment
) => {
	// Build the context message that preserves our great VC prompt while adding the new information
	let contextMessage = `CONTEXT FOR THIS INTERVENTION (Question ${questionNumber} of 2):\n`;
	contextMessage += `- Full pitch deck: Available (${selectedAssignment})\n`;
	contextMessage += `- Founder just presented: Slides ${slideRange.start}-${slideRange.end}\n\n`;

	contextMessage += `SLIDES CONTENT:\n${slideData.focused_content}\n\n`;

	if (audioSegment) {
		contextMessage += `FOUNDER'S PRESENTATION: [Audio recorded but not yet transcribed]\n\n`;
	}

	contextMessage += `I just finished presenting slides ${slideRange.start}-${slideRange.end} of my pitch deck. Ask me one specific VC-style question about these slides.`;

	return contextMessage;
};

export const calculatePresentedSlideRange = (lockSlide) => {
	// Lock triggers when trying to advance FROM the lock slide
	// So if locked at slide 2, they just presented slides 1-2
	// If locked at slide 4, they just presented slides 3-4, etc.
	const end = lockSlide;
	const start = lockSlide === 2 ? 1 : lockSlide - 1; // First range is 1-2, then 3-4, 5-6, etc.

	return { start, end };
};
