import { useEffect, useMemo, useRef, useState } from "react";
import { getProfessorSession, markSessionReviewed } from "../../services/api";
import FeedbackDisplay from "../feedback/FeedbackDisplay";
import { convertDbFeedbackToDisplay, exportToPdf } from "../../utils";

// TODO: Another one to get rid of soon.
/**
 * Props:
 * - sessionId: string
 * - onReviewed?: (updated) => void
 * - defaultOpen?: boolean   // parent controls mount/unmount; we still animate
 */
export default function FeedbackRow({
	sessionId,
	onReviewed,
	defaultOpen = true,
}) {
	const [loading, setLoading] = useState(true);
	const [err, setErr] = useState("");
	const [session, setSession] = useState(null);
	const [animReady, setAnimReady] = useState(false); // to trigger CSS transition after mount
	const panelRef = useRef(null);

	useEffect(() => {
		let alive = true;
		(async () => {
			setLoading(true);
			setErr("");
			try {
				const data = await getProfessorSession(sessionId);
				if (alive) setSession(data);
			} catch (e) {
				if (alive) setErr(e?.message || "Failed to load feedback");
			} finally {
				if (alive) setLoading(false);
				// allow next tick so height is measured after render
				requestAnimationFrame(() => setAnimReady(true));
			}
		})();
		return () => {
			alive = false;
		};
	}, [sessionId]);

	const feedback = session?.feedback || null;
	const meta = useMemo(() => {
		const created = session?.createdAt
			? new Date(session.createdAt).toLocaleString()
			: "—";
		const completed = session?.completedAt
			? new Date(session.completedAt).toLocaleString()
			: "—";
		const slides = session?.slideCount ?? "—";
		// audio duration not persisted; show em dash for now
		return { created, completed, slides, audio: "—" };
	}, [session]);

	async function onMarkReviewed() {
		try {
			const updated = await markSessionReviewed(sessionId, true);
			setSession((prev) => ({
				...(prev || {}),
				feedback: { ...(prev?.feedback || {}), ...updated },
			}));
			onReviewed?.(updated);
		} catch (e) {
			alert(e?.message || "Failed to mark as reviewed");
		}
	}

	// Printing
	function handlePrint() {
		window.print();
	}

	async function handleExportPdf() {
		const node = panelRef.current;
		if (!node) return;

		try {
			await exportToPdf(node, sessionId);
		} catch (e) {
			alert(e?.message || "Failed to export PDF");
		}
	}

	// return (
	// 	<tr
	// 		ref={panelRef}
	// 		className={`overflow-hidden transition-[max-height] duration-300 ${
	// 			animReady ? "max-h-[2000px]" : "max-h-0"
	// 		}`}
	// 	>
	// 		<td className="p-4 bg-gray-50 border-t">
	// 			{/* Meta */}
	// 			<td className="flex flex-wrap items-center gap-4 text-xs text-gray-600 mb-3">
	// 				<div>
	// 					<span className="font-medium">Created:</span> {meta.created}
	// 				</div>
	// 				<div>
	// 					<span className="font-medium">Completed:</span> {meta.completed}
	// 				</div>
	// 				<div>
	// 					<span className="font-medium">Slides:</span> {meta.slides}
	// 				</div>
	// 				<div>
	// 					<span className="font-medium">Audio:</span> {meta.audio}
	// 				</div>
	// 				{feedback?.viewedByProfessor && (
	// 					<div className="text-green-700">Reviewed ✓</div>
	// 				)}
	// 			</td>

	// 			{/* Actions */}
	// 			<td className="flex gap-2 mb-3 no-print no-export">
	// 				<button
	// 					onClick={handlePrint}
	// 					className="px-3 py-1 text-sm border rounded"
	// 				>
	// 					Print
	// 				</button>
	// 				<button
	// 					onClick={handleExportPdf}
	// 					className="px-3 py-1 text-sm border rounded"
	// 				>
	// 					Export PDF
	// 				</button>
	// 				{!feedback?.viewedByProfessor && (
	// 					<button
	// 						onClick={onMarkReviewed}
	// 						className="px-3 py-1 text-sm rounded bg-blue-600 text-white"
	// 					>
	// 						Mark as Reviewed
	// 					</button>
	// 				)}
	// 			</td>

	// 			{/* Content */}
	// 			{loading ? (
	// 				<div className="text-sm text-gray-500">Loading feedback…</div>
	// 			) : err ? (
	// 				<div className="text-sm text-red-600">Error: {err}</div>
	// 			) : (
	// 				<div className="text-sm text-gray-500">
	// 					No feedback saved for this session.
	// 				</div>
	// 			)}
	// 		</td>
	// 	</tr>
	// );

	const animationClass = animReady ? "max-h-[2000px]" : "max-h-0";
	const tableRowClasses = `w-full border-b border-gray-200 overflow-hidden transition-[max-height] duration-300 ${animationClass}`;
	return (
		<tr
			className={tableRowClasses}
			ref={panelRef}
		></tr>
	);
}
