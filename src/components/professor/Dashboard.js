import { useMemo, useState, useCallback } from "react";

import SessionFeedbackTable from "./SessionFeedbackTable";
import RefreshIcon from "../ui/RefreshIcon";
import LogoutButton from "../ui/LogoutButton";

import { listProfessorSessions } from "../../services/api";
import { usePolling } from "../../hooks/usePolling";

export default function Dashboard() {
	const [rows, setRows] = useState([]);
	const [error, setError] = useState("");

	// UI state
	const [query, setQuery] = useState("");
	const [sortField, setSortField] = useState("createdAt"); // 'student' | 'createdAt' | 'completedAt' | 'status' | 'feedback'
	const [sortDir, setSortDir] = useState("desc"); // 'asc' | 'desc'
	const [page, setPage] = useState(1);
	const pageSize = 20;

	const load = useCallback(async () => {
		setError("");
		try {
			const data = await listProfessorSessions();
			setRows(Array.isArray(data) ? data : []);
		} catch (e) {
			setError(e?.message || "Failed to load sessions");
		} finally {
			// setBusy(false);
		}
	}, []);

	// TODO: Not giving me the UI experience I want...
	// When 'handleRefresh' is called, I want to see the loading spinner.
	// Auto-refresh every 30s (and run immediately on mount)
	const { tick, pending: isLoading } = usePolling({
		fn: load,
		interval: 30000,
		immediate: true,
		enabled: true,
		defaultMinDurationMs: 0,
	});

	// Handlers
	const handlePageChange = (next) => {
		if (next < 1 || next > totalPages) return;
		setPage(next);
	};

	const handleRefresh = () => {
		// manual one-off refresh
		void tick({ minDurationMs: 1000 }); // give UI time to update
	};

	const handleSearch = (e) => {
		const value = e.target.value;
		setQuery(value);
		setPage(1); // reset to first page on search change
	};

	const handleSort = (field) => {
		if (field === sortField) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortField(field);
			setSortDir("asc");
		}
		setPage(1);
	};

	// Derived: filter → sort → paginate
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter((r) =>
			(r.student?.name || "").toLowerCase().includes(q)
		);
	}, [rows, query]);

	const sorted = useMemo(() => {
		const arr = [...filtered];
		const dir = sortDir === "asc" ? 1 : -1;
		arr.sort((a, b) => {
			switch (sortField) {
				case "student": {
					const an = (a.student?.name || "").toLowerCase();
					const bn = (b.student?.name || "").toLowerCase();
					return an > bn ? dir : an < bn ? -dir : 0;
				}
				case "createdAt": {
					const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
					const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
					return (at - bt) * dir;
				}
				case "completedAt": {
					const at = a.completedAt ? new Date(a.completedAt).getTime() : 0;
					const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0;
					return (at - bt) * dir;
				}
				case "status": {
					const as = (a.status || "").toString();
					const bs = (b.status || "").toString();
					return as > bs ? dir : as < bs ? -dir : 0;
				}
				case "feedback": {
					const af = !!a.feedback;
					const bf = !!b.feedback;
					return (Number(af) - Number(bf)) * dir;
				}
				default:
					return 0;
			}
		});
		return arr;
	}, [filtered, sortField, sortDir]);

	const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
	const paged = useMemo(() => {
		const start = (page - 1) * pageSize;
		return sorted.slice(start, start + pageSize);
	}, [sorted, page, pageSize]);

	// const isLoading = busy || pending;

	return (
		<div className="p-6">
			<div className="flex items-center justify-between mb-2">
				<h1 className="text-xl font-semibold">Professor Dashboard</h1>
				<LogoutButton />
			</div>

			<div className="flex flex-row justify-between gap-2 no-print mb-4">
				<input
					type="search"
					value={query}
					onChange={handleSearch}
					placeholder="Search by student name…"
					className="border rounded px-3 py-1.5 text-sm w-1/4"
					aria-label="Search by student name"
				/>
				<button
					onClick={handleRefresh}
					className="px-3 py-1.5 text-sm rounded border flex items-center gap-2"
					aria-label="Refresh"
					title="Refresh"
					disabled={isLoading}
				>
					<RefreshIcon
						className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
					/>
					<span className="hidden sm:inline">
						{isLoading ? "Refreshing…" : "Refresh"}
					</span>
				</button>
			</div>

			{error && <div className="text-sm text-red-600 mb-2">Error: {error}</div>}
			{isLoading && !rows.length && (
				<div className="text-sm text-gray-500 mb-2">Loading…</div>
			)}

			<SessionFeedbackTable
				rows={paged}
				busy={isLoading}
				sortField={sortField}
				sortDir={sortDir}
				onSortChange={handleSort}
			/>

			{/* Pagination */}
			<div className="mt-3 flex items-center justify-between text-sm pagination no-print">
				<div>
					Page {page} of {totalPages} • {sorted.length} total
				</div>
				<div className="flex items-center gap-1">
					<button
						className="px-2 py-1 rounded border"
						onClick={() => handlePageChange(1)}
						disabled={page === 1}
					>
						« First
					</button>
					<button
						className="px-2 py-1 rounded border"
						onClick={() => handlePageChange(page - 1)}
						disabled={page === 1}
					>
						‹ Prev
					</button>
					<button
						className="px-2 py-1 rounded border"
						onClick={() => handlePageChange(page + 1)}
						disabled={page === totalPages}
					>
						Next ›
					</button>
					<button
						className="px-2 py-1 rounded border"
						onClick={() => handlePageChange(totalPages)}
						disabled={page === totalPages}
					>
						Last »
					</button>
				</div>
			</div>
		</div>
	);
}
