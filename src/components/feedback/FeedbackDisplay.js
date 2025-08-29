// src/components/professor/SessionTableRow.js
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Chevron from "../ui/Chevron";
import { getProfessorSession } from "../../services/api";
import { IMAGE_BASE } from "../../constants"; // for audio base

// TODO: This is another Feedback display component that we'll be getting rid of soon.
const statusIconMap = {
	met: "✓",
	not_met: "✗",
	not_applicable: "N/A",
	unknown: "?",
};
const statusClassMap = {
	met: "text-emerald-600",
	not_met: "text-red-600",
	not_applicable: "text-gray-500",
	unknown: "text-gray-400",
};

function StatusItem({ feedbackItem, label }) {
	const { status, comment } = feedbackItem || {};
	const statusColorClass = statusClassMap[status || "unknown"];
	const statusIcon = statusIconMap[status || "unknown"];
	const feedbackComment = comment || "No feedback available";

	return (
		<div className="mb-1.5 p-2 border border-gray-200 rounded-md bg-white">
			<strong className="text-slate-800">{label}: </strong>
			<span className={`font-bold ${statusColorClass}`}>{statusIcon}</span>
			<div className="text-sm leading-relaxed text-slate-600 mt-1">
				{feedbackComment}
			</div>
		</div>
	);
}

function CompactSlideRows({ slides }) {
	const [audioErrors, setAudioErrors] = useState({});

	const setErr = (n) =>
		setAudioErrors((prev) => ({
			...prev,
			[n]: true,
		}));

	if (!slides?.length) {
		return (
			<div className="text-sm text-gray-500 p-4">
				No slide feedback available.
			</div>
		);
	}

	return (
		<div className="bg-white rounded border border-gray-200 overflow-hidden">
			<table className="w-full border-collapse">
				<thead>
					<tr className="bg-gray-50 border-b border-gray-200">
						<th className="px-4 py-3 text-center font-semibold text-slate-600 w-[220px]">
							Slide
						</th>
						<th className="px-4 py-3 text-center font-semibold text-slate-600">
							Learning Objectives Feedback
						</th>
						<th className="px-4 py-3 text-center font-semibold text-slate-600 w-[220px]">
							Audio
						</th>
					</tr>
				</thead>
				<tbody>
					{slides.map((s) => {
						const { feedback } = s;
						const audioSrc = s?.audio_url
							? `${IMAGE_BASE}${s.audio_url}`
							: null;
						const n = s.slide_number;

						return (
							<tr
								key={n}
								className="border-b border-gray-200"
							>
								{/* Left column (no image) */}
								<td className="p-4 align-top text-center">
									<div className="mb-1 font-medium text-gray-700">
										Slide {n}
									</div>
									<div className="text-[11px] text-gray-500">
										(image hidden in table view)
									</div>
								</td>

								{/* Middle: Learning Objectives (same look as SlideRow) */}
								<td className="p-4 align-top bg-slate-50">
									<div className="mb-2 font-bold text-slate-800">
										Learning Objectives
									</div>
									<StatusItem
										feedbackItem={feedback?.content_structuring}
										label="Content structuring"
									/>
									<StatusItem
										feedbackItem={feedback?.delivery}
										label="Delivery"
									/>
									<StatusItem
										feedbackItem={feedback?.impromptu_response}
										label="Impromptu response"
									/>
									<StatusItem
										feedbackItem={feedback?.composure}
										label="Composure"
									/>
								</td>

								{/* Right: Audio (same styling as SlideRow) */}
								<td className="p-4 align-top text-center">
									<div className="mb-2 font-bold text-slate-800">
										Audio Segment
									</div>
									{audioSrc && !audioErrors[n] ? (
										<>
											<audio
												controls
												className="w-full max-w-[180px] mx-auto"
												onError={() => setErr(n)}
											>
												<source
													src={audioSrc}
													type="audio/wav"
												/>
												Your browser does not support the audio element.
											</audio>
											<div className="mt-1 text-[11px] text-gray-600">
												Audio for this slide
											</div>
										</>
									) : (
										<div className="w-[180px] h-10 mx-auto border border-dashed border-gray-300 rounded flex items-center justify-center text-gray-600 text-xs">
											{audioErrors[n]
												? "Audio not available"
												: "No audio segment"}
										</div>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

function Row({ r }) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [err, setErr] = useState("");
	const [slides, setSlides] = useState([]);

	const studentName = r.student?.name || "—";
	const created = r.createdAt ? new Date(r.createdAt).toLocaleString() : "—";
	const completed = r.completedAt
		? new Date(r.completedAt).toLocaleString()
		: "—";

	// Score: leave blank unless backend provides something (presentationScore, etc.)
	const score = r?.feedback?.presentationScore ?? "—";

	useEffect(() => {
		if (!open) return;
		let alive = true;
		(async () => {
			setLoading(true);
			setErr("");
			try {
				const data = await getProfessorSession(r.id);
				// Expect data.feedback.structured (as in your generate-feedback response)
				const structured = data?.feedback?.structured;
				const slideArr = structured?.slides || [];
				if (alive) setSlides(slideArr);
			} catch (e) {
				if (alive) setErr(e?.message || "Failed to load session feedback");
			} finally {
				if (alive) setLoading(false);
			}
		})();
		return () => {
			alive = false;
		};
	}, [open, r.id]);

	return (
		<>
			{/* Collapsed summary row */}
			<tr className="border-b">
				<td className="py-2 pl-2">
					<button
						type="button"
						onClick={() => setOpen((v) => !v)}
						className="inline-flex items-center gap-2"
						aria-expanded={open}
						aria-label={open ? "Collapse feedback" : "Expand feedback"}
					>
						<Chevron open={open} />
						<span className="underline decoration-dotted">Details</span>
					</button>
				</td>
				<td className="py-2">{studentName}</td>
				<td className="font-mono">
					<Link
						to={`/professor/session/${r.id}`}
						className="text-blue-600 underline"
					>
						{r.id.slice(0, 8)}…
					</Link>
				</td>
				<td>{created}</td>
				<td>{completed}</td>
				<td>
					{/* color chip by score (placeholder; adjust when you have a real numeric) */}
					<span className="inline-flex items-center gap-1">
						<span
							className={`inline-block w-2 h-2 rounded-full ${
								score === "—"
									? "bg-gray-300"
									: score >= 80
									? "bg-emerald-500"
									: score >= 50
									? "bg-amber-500"
									: "bg-red-500"
							}`}
						/>
						{score}
					</span>
				</td>
			</tr>

			{/* Expanded panel: compact per-slide rows (no images) */}
			{open && (
				<tr className="border-b bg-white">
					<td
						colSpan={7}
						className="p-4"
					>
						{loading ? (
							<div className="text-sm text-gray-500">Loading feedback…</div>
						) : err ? (
							<div className="text-sm text-red-600">Error: {err}</div>
						) : slides.length ? (
							<CompactSlideRows slides={slides} />
						) : (
							<div className="text-sm text-gray-500">
								No feedback saved for this session.
							</div>
						)}
					</td>
				</tr>
			)}
		</>
	);
}

export default function SessionTableRow({ rows = [], busy = false }) {
	if (busy && (!rows || rows.length === 0)) {
		return (
			<tr>
				<td
					colSpan="7"
					className="text-center py-4 text-gray-500"
				>
					Loading…
				</td>
			</tr>
		);
	}
	if (!rows || rows.length === 0) {
		return (
			<tr>
				<td
					colSpan="7"
					className="text-center py-4 text-gray-500"
				>
					No sessions found.
				</td>
			</tr>
		);
	}

	return (
		<>
			{rows.map((r) => (
				<Row
					key={r.id}
					r={r}
				/>
			))}
		</>
	);
}
