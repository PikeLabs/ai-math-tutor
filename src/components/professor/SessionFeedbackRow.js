import { useState, useEffect, useMemo, useRef } from "react";

import FeedbackReport from "../feedback/FeedbackReport";
import Chevron from "../ui/Chevron";
import { getProfessorSession } from "../../services/api";
import { convertDbFeedbackToDisplay } from "../../utils";

// NOTE: This is a feedback component that are going to keep.
// TODO: Unistall jspdfMod, h2cMod;
function DropDownContainer({ toggleOpen, feedbackData, error }) {
	if (!toggleOpen) return null;
	if (error) {
		return (
			<div className="text-md text-red-600 font-medium py-3">
				Something went wrong while retrieving the session feedback details{" "}
				{error}
			</div>
		);
	} else if (feedbackData) {
		return <FeedbackReport feedback={feedbackData} />;
	}

	return (
		<div className="text-md text-gray-500 py-3">
			No feedback available for this session.
		</div>
	);
}

function DropDownButton({ toggleOpen, onClick }) {
	const ariaLabel = toggleOpen
		? "Collapse feedback details"
		: "Expand feedback details";
	return (
		<button
			type="button"
			onClick={onClick}
			className="inline-flex items-center gap-2 shrink-0"
			aria-expanded={toggleOpen}
			aria-label={ariaLabel}
		>
			<Chevron open={toggleOpen} />
			<span className="underline decoration-dotted">Details</span>
		</button>
	);
}

const COLS = 6;
function SessionFeedbackDetails({ session }) {
	// If dashboard already queries feedback, do I need to call getProfessorSession?
	const [toggleOpen, setToggleOpen] = useState(false);
	const [err, setErr] = useState("");
	const [sessionDetails, setSessionDetails] = useState();
	const [animReady, setAnimReady] = useState(false);

	console.log("SessionFeedbackRow session:", session);

	// smooth height transition
	const panelRef = useRef(null);

	// Feedback data for styling consistency???
	const feedback = session?.feedback || null;

	// Build FeedbackReport data once we have the detailed session
	const feedbackData = useMemo(() => {
		const fb = session?.feedback || null;
		if (!fb) return null;
		return convertDbFeedbackToDisplay(fb);
	}, [session]);

	const handleDropdownToggle = () => setToggleOpen((v) => !v);

	const handlePrintReport = () => {
		window.print();
	};

	useEffect(() => {
		let raf = requestAnimationFrame(() => setAnimReady(true));
		return () => cancelAnimationFrame(raf);
	}, []);

	useEffect(() => {
		let alive = true;
		if (!toggleOpen || sessionDetails) return;

		(async () => {
			setErr("");
			try {
				const data = await getProfessorSession(session.id);
				if (alive) setSessionDetails(data);
			} catch (e) {
				if (alive) setErr(e?.message || "Failed to load feedback");
			}
		})();

		return () => {
			alive = false;
		};
	}, [session, sessionDetails, toggleOpen]);

	// TODO: Need to figure presentationScore out....
	const presentationScore = feedback?.presentationScore || "—";
	const studentName = session.student?.name || "—";
	const created = session.createdAt
		? new Date(session.createdAt).toLocaleString()
		: "—";
	const completed = session.completedAt
		? new Date(session.completedAt).toLocaleString()
		: "—";

	const animMaxHeight = animReady && toggleOpen ? "max-h-[2000px]" : "max-h-0";
	const animHeightClass = `transition-[max-height] duration-300 ease-in-out overflow-hidden ${animMaxHeight}`;
	const animOpacity = toggleOpen ? "opacity-100" : "opacity-0";
	const animOpacityClass = `p-4 transition-opacity duration-300 ${animOpacity}`;

	return (
		<>
			{/* Collapsed row */}
			<tr className="w-full border-b border-gray-200">
				<td className="py-2 text-md font-medium">
					<DropDownButton
						toggleOpen={toggleOpen}
						onClick={handleDropdownToggle}
					/>
				</td>
				{/* Student column */}
				<td className="py-2 text-md font-medium">{studentName}</td>
				{/* Session ID column */}
				<td className="py-2 text-md font-medium">
					{session.id}
					{/* TODO: Remove SessionDetails */}
				</td>
				{/* Created column */}
				<td className="py-2 text-md font-medium">{created}</td>
				{/* Completed column */}
				<td className="py-2 text-md font-medium">{completed}</td>
				{/* Score column */}
				<td className="text-center font-medium py-2 text-md font-medium">
					{presentationScore}
				</td>
			</tr>

			{/* Expanded content row */}
			<tr className="border-b bg-gray-50">
				<td
					colSpan={COLS}
					className="p-0"
				>
					<div
						ref={panelRef}
						className={animHeightClass}
					>
						<div className={animOpacityClass}>
							<DropDownContainer
								toggleOpen={toggleOpen}
								feedbackData={feedbackData}
								error={err}
							/>
						</div>
					</div>
				</td>
			</tr>
		</>
	);
}

export default function SessionFeedbackRow({ rows = [], busy = false }) {
	if (!rows || rows.length === 0) {
		const rowContent = busy ? "Loading..." : "No sessions found";
		return (
			<tr className="w-full border-b border-gray-200">
				<td
					colSpan={COLS}
					className="py-2 pl-2 text-center text-gray-500"
				>
					{rowContent}
				</td>
			</tr>
		);
	}

	return rows.map((session) => (
		<SessionFeedbackDetails
			key={session.id}
			session={session}
		/>
	));
}
