import { ENDPOINTS } from "../constants";

// TODO: Add helper class to remove all the duplicate code and improve error handling.
// --- Auth ---
export async function professorLogin(password) {
	const r = await fetch(ENDPOINTS.professor.login, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify({ password }),
	});

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Login Failed: ${errMsg}`);
	}

	if (!r.ok || data?.error) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`Login Failed: ${errMsg}`);
	}

	return data;
}

export async function professorLogout() {
	const r = await fetch(ENDPOINTS.professor.logout, {
		method: "POST",
		credentials: "include",
	});

	let data;

	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Logout Failed: ${errMsg}`);
	}

	if (!r.ok) {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Logout Failed: ${errMsg}`);
	}

	return data;
}

export async function checkIsProfessor() {
	const r = await fetch(ENDPOINTS.professor.me, {
		method: "GET",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
	});

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`CheckisProfessor failed: ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg =
			data?.error ||
			r.statusText ||
			"Login cookie not set (check CORS/cookie settings)";
		throw new Error(`CheckisProfessor failed: ${errMsg}`);
	}

	return data;
}

// --- Sesssions ---
export async function createSession({ studentName, slideCount, pdfUrl }) {
	const r = await fetch(ENDPOINTS.session.create, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ studentName, slideCount, pdfUrl }),
	});

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Create Session failed: ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`Create Session failed: ${errMsg}`);
	}

	return data;
}

export async function patchSession(
	sessionId,
	{ slideCount, status, pdfUrl, completedAt }
) {
	const r = await fetch(ENDPOINTS.session.patch(sessionId), {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ slideCount, status, pdfUrl, completedAt }),
	});

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Patch Session: ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`Patch Session: ${errMsg}`);
	}

	return data;
}

export async function listProfessorSessions() {
	const r = await fetch(ENDPOINTS.professor.sessions, {
		credentials: "include",
		headers: { Accept: "application/json" },
		cache: "no-store",
	});

	if (r.status === 401) throw new Error("Unauthorized");

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`List Professor Sessions Failed: ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`List Professor Sessions Failed: ${errMsg}`);
	}

	return data;
}

export async function getProfessorSession(id) {
	const r = await fetch(ENDPOINTS.professor.session(id), {
		credentials: "include",
		headers: { Accept: "application/json" },
		cache: "no-store",
	});

	if (r.status === 401) throw new Error("Unauthorized");

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Get Professor Session failed: ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`Get Professor Session failed: ${errMsg}`);
	}

	return data;
}

export async function markSessionReviewed(sessionId, reviewed = true) {
	const r = await fetch(ENDPOINTS.professor.markReviewed(sessionId), {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify({ reviewed }),
	});

	let data;

	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Mark Session Reviewed failed: ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`Mark Session Reviewed failed: ${errMsg}`);
	}

	return data;
}

// --- Chat ---
// TODO: Update to return json;
export async function createChat({
	sessionId,
	messages,
	selectedAssignment,
	slideNumber,
}) {
	const timestamp = new Date().toISOString();
	const r = await fetch(ENDPOINTS.chat.json(0), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			sessionId,
			messages,
			selectedAssignment,
			slideNumber,
			timestamp,
		}),
	});

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Create Chat Failed: ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`Create Chat Failed: ${errMsg}`);
	}

	return data;
}

// TODO: Update to return json;
export async function createChatWithAudio(formData) {
	formData.append("timestamp", new Date().toISOString());
	const r = await fetch(ENDPOINTS.chat.audio(0), {
		method: "POST",
		body: formData,
	});

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Create Chat with Audio Failed: ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`Create Chat with Audio Failed: ${errMsg}`);
	}

	return data;
}

// --- Conversations ---
// TODO: Need to implement
export async function logConversation({
	sessionId,
	role,
	content,
	slideNumber,
	timestamp,
}) {
	const r = await fetch(ENDPOINTS.session.conversations(sessionId), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ role, content, slideNumber, timestamp }),
	});

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Log Conversation failed: ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`Log Conversation failed: ${errMsg}`);
	}

	return data;
}

// --- Feedback ---
// TODO: Update to return json;
export async function saveFeedback({
	sessionId,
	overallFeedback = "",
	presentationScore = null,
	slideFeedback = null,
	strengths = null,
	improvements = null,
}) {
	const r = await fetch(ENDPOINTS.feedback.create, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			sessionId,
			overallFeedback,
			presentationScore,
			slideFeedback,
			strengths,
			improvements,
		}),
	});

	if (!r.ok) throw new Error(`saveFeedback failed ${r.status}`);
	return r;
}

// TODO: Update to return json;
export async function generateFeedbackMultipart(formData) {
	const r = await fetch(ENDPOINTS.feedback.generate, {
		method: "POST",
		body: formData, // includes recording blob if present
	});

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Failed to generate feedback (multipart): ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`Failed to generate feedback (multipart): ${errMsg}`);
	}

	return data;
}

// TODO: Update to return json;
// (optional JSON variant if you ever want to generate without audio)
export async function generateFeedbackJSON(payload) {
	const r = await fetch(ENDPOINTS.feedback.generate, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Failed to generate feedback (json): ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`Failed to generate feedback (json): ${errMsg}`);
	}

	return data;
}

// Note: Development/testing only
export async function getTestFeedback() {
	const r = await fetch(ENDPOINTS.feedback.test);

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Get Test Feedback failed: ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`Get Test Feedback failed: ${errMsg}`);
	}

	return data;
}

// --- PDF ---
export const postPdfForSlides = async (formdata) => {
	const r = await fetch(ENDPOINTS.uploads.slides, {
		method: "POST",
		body: formdata,
	});

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`postPdfForSlides failed: ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`postPdfForSlides failed: ${errMsg}`);
	}

	return data;
};

// --- Slides ---
export const postAssignmentSlides = async (assignment, { start, end }) => {
	const r = await fetch(ENDPOINTS.assignments.slides(assignment), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			start_slide: start,
			end_slide: end,
		}),
	});

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Post Assignment Slides Failed: ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`Post Assignment Slides Failed: ${errMsg}`);
	}

	return data;
};

// TODO: This is unused
export async function getSessionFeedback(sessionId) {
	const r = await fetch(`${ENDPOINTS.professor.session(sessionId)}`, {
		method: "GET",
		credentials: "include",
		headers: { Accept: "application/json" },
		cache: "no-store",
	});

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Post Assignment Slides Failed: ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`Post Assignment Slides Failed: ${errMsg}`);
	}

	return data?.feedback?.structured || data?.feedback || data;
}

export async function getStudentFeedback(sessionId) {
	const r = await fetch(`${ENDPOINTS.feedback.get(sessionId)}`, {
		credentials: "include",
		headers: { Accept: "application/json" },
		cache: "no-store",
	});

	let data;
	try {
		data = await r.json();
	} catch {
		const text = await r.text().catch(() => "");
		const errMsg = text || r.statusText || "Unknown error";
		throw new Error(`Get Student Feedback failed: ${errMsg}`);
	}

	if (!r.ok) {
		const errMsg = data?.error || r.statusText || "Unknown error";
		throw new Error(`Get Student Feedback failed: ${errMsg}`);
	}

	return data;
}
