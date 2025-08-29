export const API_BASE =
	process.env.REACT_APP_API_URL || "http://localhost:5001/api/v1";

export const IMAGE_BASE = API_BASE.endsWith("/api/v1")
	? API_BASE.slice(0, -7)
	: API_BASE;

export const ENDPOINTS = {
	health: `${API_BASE}/health`,
	assignments: {
		file: (filename) => `${API_BASE}/assignments/${filename}`,
		slides: (assignment) => `${API_BASE}/assignments/${assignment}/slides`,
	},
	chat: {
		json: `${API_BASE}/chat`,
		audio: `${API_BASE}/chat/audio`,
	},
	feedback: {
		create: `${API_BASE}/feedback`, // plain save
		generate: `${API_BASE}/feedback/generate`, // generate & save
		test: `${API_BASE}/feedback/test`,
	},
	media: {
		slideImage: (uploadId, slideNumber, type = "thumbnail") =>
			`${API_BASE}/slide-image/${uploadId}/${slideNumber}?type=${encodeURIComponent(
				type
			)}`,
		audioSegment: (sessionId, slideNumber) =>
			`${API_BASE}/audio-segment/${sessionId}/${slideNumber}`,
	},
	professor: {
		sessions: `${API_BASE}/professor/sessions`,
		session: (id) => `${API_BASE}/professor/session/${id}`,
		markReviewed: (id) => `${API_BASE}/professor/session/${id}/reviewed`,
		login: `${API_BASE}/auth/professor`,
		logout: `${API_BASE}/auth/professor/logout`,
		me: `${API_BASE}/auth/professor/me`,
	},
	session: {
		create: `${API_BASE}/session/create`,
		patch: (id) => `${API_BASE}/session/${id}`,
		conversations: (id) => `${API_BASE}/session/${id}/conversations`,
		// markReviewed: (id) => `${API_BASE}/session/${id}/reviewed`, // ← add
	},
	uploads: {
		slides: `${API_BASE}/upload-slides`,
		cleanup: `${API_BASE}/cleanup`,
		deleteSessionPdf: (sessionId) => `${API_BASE}/pdf/session/${sessionId}`,
	},
};
