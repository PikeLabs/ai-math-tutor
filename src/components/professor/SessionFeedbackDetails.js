import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { ENDPOINTS } from "../../constants";

import { getProfessorSession } from "../../services/api";

// TODO: We'll be removing this component, this was the details page.
// TODO: Update css to make it match the rest of the app
// TODO: What is this component?
function Pill({ children, tone = "neutral" }) {
	const tones = {
		neutral: "bg-gray-100 text-gray-700",
		green: "bg-green-100 text-green-700",
		blue: "bg-blue-100 text-blue-700",
	};
	return (
		<span
			className={`inline-block px-2 py-0.5 rounded-full text-xs ${tones[tone]}`}
		>
			{children}
		</span>
	);
}


export default function SessionFeedbackDetails() {
	const { id } = useParams();
	const [data, setData] = useState(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		let alive = true;
		async function load() {
			setBusy(true);
			setError("");
			try {
				const s = await getProfessorSession(id);
				if (alive) setData(s);
			} catch (e) {
				if (alive) setError(e?.message || "Failed to load");
			} finally {
				if (alive) setBusy(false);
			}
		}
		load();
		return () => {
			alive = false;
		};
	}, [id]);

	const title = useMemo(() => {
		if (!data) return "Session";
		const nm = data.student?.name ? `— ${data.student.name}` : "";
		return `Session ${data.id.slice(0, 8)} ${nm}`;
	}, [data]);

	if (error) {
		return (
			<div className="p-6">
				<Link
					to="/professor"
					className="text-blue-600 underline"
				>
					← All sessions
				</Link>
				<h1 className="text-xl font-semibold mt-4 mb-2">{title}</h1>
				<div className="text-red-600">Error: {error}</div>
			</div>
		);
	}

	if (!data) {
		return (
			<div className="p-6">
				<Link
					to="/professor"
					className="text-blue-600 underline"
				>
					← All sessions
				</Link>
				<h1 className="text-xl font-semibold mt-4 mb-2">{title}</h1>
				{busy ? <div className="text-sm text-gray-500">Loading…</div> : null}
			</div>
		);
	}

	const {
		student,
		conversations = [],
		feedback,
		createdAt,
		slideCount,
		status,
	} = data;

	return (
		<div className="p-6 space-y-6">
			<Link
				to="/professor"
				className="text-blue-600 underline"
			>
				← All sessions
			</Link>

			<header className="space-y-1">
				<h1 className="text-xl font-semibold">{title}</h1>
				<div className="text-sm text-gray-600">
					Created: {new Date(createdAt).toLocaleString()} • Slides:{" "}
					{slideCount ?? "—"} • Status:{" "}
					<Pill tone="blue">{status ?? "created"}</Pill>
				</div>
			</header>

			{/* Transcript */}
			<section>
				<h2 className="font-semibold mb-2">Transcript</h2>
				<div className="space-y-2">
					{conversations.length === 0 && (
						<div className="text-sm text-gray-500">No messages yet.</div>
					)}
					{conversations.map((c) => {
						const ts = c.timestamp
							? new Date(c.timestamp).toLocaleString()
							: "";
						const slidePill =
							c.slideNumber != null ? (
								<Pill tone="neutral">Slide {c.slideNumber}</Pill>
							) : null;

						// Optional media endpoints; may 404 if you didn't generate assets for this session.
						const imgUrl =
							c.slideNumber != null
								? ENDPOINTS.media.slideImage(
										data.id,
										c.slideNumber,
										"thumbnail"
								  )
								: null;

						const audioUrl =
							c.slideNumber != null
								? ENDPOINTS.media.audioSegment(data.id, c.slideNumber)
								: null;

						const roleColor =
							c.role === "assistant"
								? "bg-blue-50 border-blue-200"
								: "bg-gray-50 border-gray-200";

						return (
							<div
								key={c.id}
								className={`border rounded p-3 ${roleColor}`}
							>
								<div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
									<Pill tone={c.role === "assistant" ? "blue" : "neutral"}>
										{c.role}
									</Pill>
									{slidePill}
									<span>• {ts}</span>
								</div>
								<div className="whitespace-pre-wrap text-sm">{c.content}</div>

								{/* Media row */}
								{(imgUrl || audioUrl) && (
									<div className="mt-2 flex items-center gap-4">
										{imgUrl ? (
											<img
												src={imgUrl}
												alt={`Slide ${c.slideNumber}`}
												width={140}
												height={90}
												onError={(e) =>
													(e.currentTarget.style.display = "none")
												}
												style={{ borderRadius: 6, border: "1px solid #e5e7eb" }}
											/>
										) : null}
										{audioUrl ? (
											<audio
												controls
												src={audioUrl}
												onError={(e) =>
													(e.currentTarget.style.display = "none")
												}
											/>
										) : null}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</section>

			{/* Feedback */}
			<section>
				<h2 className="font-semibold mb-2">Feedback</h2>
				{!feedback ? (
					<div className="text-sm text-gray-500">
						No feedback saved for this session.
					</div>
				) : (
					<div className="space-y-1 text-sm">
						{feedback.presentationScore != null && (
							<div>
								<span className="font-medium">Score:</span>{" "}
								{feedback.presentationScore}
							</div>
						)}
						{feedback.overallFeedback && (
							<div className="whitespace-pre-wrap">
								<span className="font-medium block">Overall:</span>
								{feedback.overallFeedback}
							</div>
						)}
						{feedback.slideFeedback && (
							<div className="whitespace-pre-wrap">
								<span className="font-medium block">Slides:</span>
								{feedback.slideFeedback}
							</div>
						)}
						{(feedback.strengths || feedback.improvements) && (
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{feedback.strengths && (
									<div className="whitespace-pre-wrap">
										<span className="font-medium block">Strengths</span>
										{feedback.strengths}
									</div>
								)}
								{feedback.improvements && (
									<div className="whitespace-pre-wrap">
										<span className="font-medium block">Improvements</span>
										{feedback.improvements}
									</div>
								)}
							</div>
						)}
					</div>
				)}
			</section>
		</div>
	);
}
