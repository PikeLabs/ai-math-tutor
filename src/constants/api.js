export const API_BASE =
	process.env.REACT_APP_API_URL || "http://localhost:5001/api/v1";

export const IMAGE_BASE = API_BASE.endsWith("/api/v1")
	? API_BASE.slice(0, -7)
	: API_BASE;

export const ENDPOINTS = {
	health: `${API_BASE}/health`,
	assignments: {
		slides: (assignment) =>
			`${API_BASE}/assignments/${encodeURIComponent(assignment)}/slides`,
	},
	chat: {
		json: `${API_BASE}/chat`,
		audio: `${API_BASE}/chat/audio`,
	},
	feedback: {
		create: `${API_BASE}/feedback`, // plain save
		generate: `${API_BASE}/feedback/generate`, // generate & save
		test: `${API_BASE}/feedback/test`,
		get: (sessionId) => `${API_BASE}/feedback/${encodeURIComponent(sessionId)}`,
	},
	professor: {
		sessions: `${API_BASE}/professor/sessions`,
		session: (id) => `${API_BASE}/professor/session/${encodeURIComponent(id)}`,
		markReviewed: (id) =>
			`${API_BASE}/professor/session/${encodeURIComponent(id)}/reviewed`,
		login: `${API_BASE}/auth/professor`,
		logout: `${API_BASE}/auth/professor/logout`,
		me: `${API_BASE}/auth/professor/me`,
	},
	session: {
		create: `${API_BASE}/session/create`,
		patch: (id) => `${API_BASE}/session/${encodeURIComponent(id)}`,
		conversations: (id) =>
			`${API_BASE}/session/${encodeURIComponent(id)}/conversations`,
	},
	uploads: {
		slides: `${API_BASE}/upload-slides`,
		cleanup: `${API_BASE}/cleanup`,
	},
};
