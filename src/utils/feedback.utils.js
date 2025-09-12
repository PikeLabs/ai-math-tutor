import { IMAGE_BASE } from "../constants";

// helper to resolve absolute or relative URL
export function resolveUrl(pathOrUrl) {
	if (!pathOrUrl) return null;
	const isAbs = /^https?:\/\//i.test(pathOrUrl);
	return isAbs ? pathOrUrl : `${IMAGE_BASE}${pathOrUrl}`;
}


export function parseTranscriptText(text, targetLen = 350) {
	if (!text || !text.trim()) {
		return { bySpeaker: {}, ordered: [], rawText: "" };
	}

	const rawText = text.replace(/\r\n/g, "\n").trim();
	const lines = rawText.split("\n");

	// Speaker line: e.g. "VC:", "TEST - DENNIS VAN ROSSUM:", "Student 1:"
	const SPEAKER_RE = /^\s*([A-Za-z0-9][\w .-]{0,100}):\s*(.*)$/;

	// Collect blocks as { speaker: string|null, content: string }
	const blocks = [];
	let current = null;

	const flush = () => {
		if (!current) return;
		current.content = (current.content || "").trim();
		blocks.push(current);
		current = null;
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const m = line.match(SPEAKER_RE);

		if (m) {
			// new speaker
			flush();
			const speaker = m[1].trim();
			const rest = (m[2] || "").trim();
			current = { speaker, content: rest };
		} else {
			// continuation / unlabeled
			if (!current) {
				current = { speaker: null, content: line };
			} else {
				current.content += (current.content ? "\n" : "") + line;
			}
		}
	}
	flush();

	// If no speakers found, treat as a single unlabeled block
	const hasSpeaker = blocks.some((b) => !!b.speaker);
	const normalizedBlocks = hasSpeaker
		? blocks
		: [{ speaker: "Transcript", content: rawText }];

	// Turn content into paragraphs:
	// 1) Split on 2+ newlines; 2) if still one huge paragraph, chunk by sentences (~350 chars).
	const toParagraphs = (content) => {
		const cleaned = (content || "").trim();
		if (!cleaned) return [];

		let paras = cleaned
			.split(/\n{2,}/)
			.map((p) => p.trim())
			.filter(Boolean);

		if (paras.length > 1) return paras;

		// Sentence chunking
		const sents = cleaned.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
		const chunks = [];
		let buf = "";

		for (const s of sents) {
			if (!buf) {
				buf = s;
				continue;
			}
			if ((buf + " " + s).length <= targetLen) {
				buf += " " + s;
			} else {
				chunks.push(buf);
				buf = s;
			}
		}
		if (buf) chunks.push(buf);

		return chunks.length ? chunks : [cleaned];
	};

	// Build ordered + bySpeaker map
	const ordered = normalizedBlocks.map((b) => ({
		speaker: b.speaker || "Transcript",
		paragraphs: toParagraphs(b.content),
	}));

	const bySpeaker = ordered.reduce((acc, { speaker, paragraphs }) => {
		if (!acc[speaker]) acc[speaker] = [];
		acc[speaker].push(...paragraphs);
		return acc;
	}, {});

	return { bySpeaker, ordered, rawText };
}

// Build structured transcript from feedback object (prefers dialogue_text, falls back to QA answers)
export function buildStructuredTranscript(feedback) {
	// Prefer combined VC/Student transcript if present
	const dialogue = feedback?.transcripts?.dialogue_text;
	if (dialogue && dialogue.trim()) {
		return parseTranscriptText(dialogue);
	}

	// Else fall back to concatenated QA audio transcripts (label as "Student")
	const qa = feedback?.qa_audio || feedback?.transcripts?.qa_responses || [];
	const lines = (qa || [])
		.map((seg) => {
			const t = (seg?.transcript || "").trim();
			return t ? `Student: ${t}` : "";
		})
		.filter(Boolean);

	const fallbackRaw = lines.join("\n\n");
	return parseTranscriptText(fallbackRaw);
}