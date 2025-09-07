import { useState, useEffect, useMemo, useRef } from "react";
import { useReactToPrint } from "react-to-print";

import FeedbackReport from "../feedback/FeedbackReport";
import PrintWrapper from "../ui/PrintWrapper";
import Chevron from "../ui/Chevron";
import { toLocale } from "../../utils";
import { getProfessorSession } from "../../services/api";

function DropDownContainer({
	toggleOpen,
	feedbackData,
	error,
	onPrint,
	printRef,
	isLoading,
}) {
	if (!toggleOpen) return null;

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-6 text-gray-500 text-sm">
				<div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-blue-500 rounded-full mr-2"></div>
				Loading feedback details...
			</div>
		);
	}

	if (error) {
		return (
			<div className="text-md text-red-600 font-medium py-3">
				Something went wrong while retrieving the session feedback details{" "}
				{error}
			</div>
		);
	} else if (feedbackData) {
		return (
			<div>
				<div className="flex justify-end mb-2">
					<button
						type="button"
						onClick={onPrint}
						className="no-print inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-sm font-medium hover:bg-gray-100"
						aria-label="Print this feedback report"
					>
						🖨️ Print
					</button>
				</div>
				<PrintWrapper ref={printRef}>
					<FeedbackReport feedback={feedbackData} />
				</PrintWrapper>
			</div>
		);
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
	const [isLoading, setIsLoading] = useState(false);
	const [toggleOpen, setToggleOpen] = useState(false);
	const [err, setErr] = useState("");
	const [sessionDetails, setSessionDetails] = useState(undefined);
	const [animReady, setAnimReady] = useState(false);

	// smooth height transition
	const panelRef = useRef(null);
	const printRef = useRef(null);

	// // Feedback data for styling consistency???
	const handlePrintReport = useReactToPrint({
		contentRef: printRef,
		content: () => printRef.current,
		// Optional: add/override print styles
		pageStyle: `
		@page { margin: 6mm; }
		@media print {
			body { background: #fff; }
			nav, .chat-panel, .pagination, .no-print { display: none !important; }
			.border { border: none !important; }
			.p-4 { padding: .5rem !important; }
		}
		`,
		removeAfterPrint: true,
	});

	// Build FeedbackReport data once we have the detailed session
	const feedbackData = useMemo(() => {
		const sessionFeedback = sessionDetails?.feedback ?? null;
		if (!sessionFeedback) return null;
		return sessionFeedback;
	}, [sessionDetails]);

	const meta = useMemo(() => {
		const created = session?.createdAt ? toLocale(session.createdAt) : "—";
		const completed = session?.completedAt
			? toLocale(session.completedAt)
			: "—";
		const presentationScore = session?.feedback?.presentationScore ?? "—";
		return { created, completed, presentationScore };
	}, [session]);

	const handleDropdownToggle = () => setToggleOpen((v) => !v);

	useEffect(() => {
		let raf = requestAnimationFrame(() => setAnimReady(true));
		return () => cancelAnimationFrame(raf);
	}, []);

	useEffect(() => {
		let alive = true;
		if (!toggleOpen) return;
		if (sessionDetails !== undefined) return;

		setIsLoading(true);
		(async () => {
			setErr("");
			try {
				const data = await getProfessorSession(session.id);
				if (!alive) return;
				setSessionDetails(data ?? null);
			} catch (e) {
				if (!alive) return;
				setErr(e?.message || "Failed to load feedback");
				setSessionDetails(null);
			} finally {
				if (alive) setIsLoading(false);
			}
		})();

		return () => {
			alive = false;
		};
	}, [session, sessionDetails, toggleOpen]);

	// TODO: Need to figure presentationScore out....
	// const presentationScore = feedback?.presentationScore || "—";
	const studentName = session.student?.name || "—";

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
				<td className="py-2 text-md font-medium">{meta.created}</td>
				{/* Completed column */}
				<td className="py-2 text-md font-medium">{meta.completed}</td>
				{/* Score column */}
				<td className="text-center font-medium py-2 text-md font-medium">
					{meta.presentationScore}
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
								onPrint={handlePrintReport}
								printRef={printRef}
								isLoading={isLoading}
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
