import { useState, useEffect, useMemo, useRef } from "react";
import { useReactToPrint } from "react-to-print";

import FeedbackReport from "../feedback/FeedbackReport";
import PrintWrapper from "../ui/PrintWrapper";
import Chevron from "../ui/Chevron";
import { toLocale } from "../../utils";
import { getProfessorSession } from "../../services/api";
import { TableRow, TableCell } from "../ui/table";
import { Button } from "../ui/button";
import { Alert, AlertTitle, AlertDescription } from "../ui/alert";

const FEEDBACK_TABLE_COLUMNS = 4;

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
			<div
				className="flex items-center justify-center py-6 text-sm text-muted-foreground"
				aria-live="polite"
				aria-atomic="true"
			>
				<div className="mr-2 h-5 w-5 rounded-full border-2 border-border border-t-primary animate-spin" />
				Loading feedback details...
			</div>
		);
	}

	if (error) {
		return (
			<Alert
				variant="destructive"
				className="my-2"
			>
				<AlertTitle>Failed to load feedback</AlertTitle>
				<AlertDescription>{String(error)}</AlertDescription>
			</Alert>
		);
	} else if (feedbackData) {
		return (
			<div>
				<div className="flex justify-end mb-2">
					<Button
						type="button"
						variant="outline"
						onClick={onPrint}
						className="no-print h-auto inline-flex items-center gap-2"
						aria-label="Print this feedback report"
					>
						🖨️ Print
					</Button>
				</div>
				<PrintWrapper ref={printRef}>
					<FeedbackReport feedback={feedbackData} />
				</PrintWrapper>
			</div>
		);
	}

	return (
		<div className="py-3 text-sm text-muted-foreground">
			No feedback available for this session.
		</div>
	);
}

function DropDownButton({ toggleOpen, onClick }) {
	const ariaLabel = toggleOpen
		? "Collapse feedback details"
		: "Expand feedback details";
	return (
		<Button
			type="button"
			onClick={onClick}
			variant="link"
			size="sm"
			className="inline-flex items-center gap-2 shrink-0 h-auto px-0 underline-offset-4"
			aria-expanded={toggleOpen}
			aria-label={ariaLabel}
		>
			<Chevron open={toggleOpen} />
		</Button>
	);
}

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

	const animMaxHeight = animReady && toggleOpen ? "max-h-[9999px]" : "max-h-0";
	const animHeightClass = `transition-[max-height] duration-300 ease-in-out ${
		toggleOpen ? "overflow-visible" : "overflow-hidden"
	} ${animMaxHeight}`;

	const animOpacity = toggleOpen ? "opacity-100" : "opacity-0";
	const animOpacityClass = `p-4 transition-opacity duration-300 bg-card text-foreground ${animOpacity}`;

	return (
		<>
			{/* Collapsed row */}
			<TableRow className="w-full border-b border-border">
				{/* Student */}
				<TableCell className="py-2 text-sm font-medium text-foreground">
					<div className="flex flex-row items-center gap-2">
						<DropDownButton
							toggleOpen={toggleOpen}
							onClick={handleDropdownToggle}
						/>

						{studentName}
					</div>
				</TableCell>

				{/* Created */}
				<TableCell className="py-2 text-sm text-foreground">
					{meta.created}
				</TableCell>

				{/* Completed */}
				<TableCell className="py-2 text-sm text-foreground">
					{meta.completed}
				</TableCell>

				{/* Score */}
				<TableCell className="py-2 text-center text-sm font-medium text-foreground">
					{meta.presentationScore}
				</TableCell>
			</TableRow>

			<TableRow className="border-b bg-muted/40">
				<TableCell
					colSpan={FEEDBACK_TABLE_COLUMNS}
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
				</TableCell>
			</TableRow>
		</>
	);
}

export default function SessionFeedbackRow({ rows = [], busy = false }) {
	if (!rows || rows.length === 0) {
		const rowContent = busy ? "Loading..." : "No sessions found";
		return (
			<TableRow className="w-full border-b border-border">
				<TableCell
					colSpan={FEEDBACK_TABLE_COLUMNS}
					className="py-4 text-center text-lg text-muted-foreground"
				>
					{rowContent}
				</TableCell>
			</TableRow>
		);
	}

	return rows.map((session) => (
		<SessionFeedbackDetails
			key={session.id}
			session={session}
		/>
	));
}
