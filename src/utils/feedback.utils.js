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

// Export to PDF (lazy import to avoid adding bundle weight upfront)
export async function exportToPdf(node, sessionId) {
	try {
		const [jspdfMod, h2cMod] = await Promise.all([
			import("jspdf"),
			import("html2canvas"),
		]);
		const { jsPDF } = jspdfMod;
		const html2canvas = h2cMod.default;

		const canvas = await html2canvas(node, {
			scale: 2,
			useCORS: true,
			backgroundColor: "#ffffff",
			ignoreElements: (el) => el.classList?.contains("no-export"),
		});

		const imgData = canvas.toDataURL("image/png");
		const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
		const pageWidth = pdf.internal.pageSize.getWidth();
		const pageHeight = pdf.internal.pageSize.getHeight();
		const imgWidth = pageWidth - 64; // margins
		const imgHeight = (canvas.height * imgWidth) / canvas.width;
		const x = 32;
		let y = 32;

		// paginate if longer than one page
		if (imgHeight <= pageHeight - 64) {
			pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);
		} else {
			// simple slice into pages
			let remaining = imgHeight;
			let position = 0;
			const pageCanvas = document.createElement("canvas");
			const ctx = pageCanvas.getContext("2d");
			const sliceHeight = ((pageHeight - 64) * canvas.width) / imgWidth;

			pageCanvas.width = canvas.width;
			pageCanvas.height = sliceHeight;

			while (remaining > 0) {
				ctx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
				ctx.drawImage(
					canvas,
					0,
					position,
					canvas.width,
					sliceHeight,
					0,
					0,
					pageCanvas.width,
					pageCanvas.height
				);
				const pageImg = pageCanvas.toDataURL("image/png");
				pdf.addImage(pageImg, "PNG", x, y, imgWidth, pageHeight - 64);
				remaining -= pageHeight - 64;
				position += sliceHeight;
				if (remaining > 0) pdf.addPage();
			}
		}

		pdf.save(`feedback_${sessionId.slice(0, 8)}.pdf`);
	} catch (e) {
		console.error(e);
		throw e;
	}
}
