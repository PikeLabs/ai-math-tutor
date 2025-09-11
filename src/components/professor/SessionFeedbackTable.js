import SessionFeedbackRow from "./SessionFeedbackRow";
import TableSortHeader from "../ui/TableSortHeader";

export default function SessionFeedbackTable({
	rows = [],
	busy = false,
	sortField,
	sortDir,
	onSortChange,
}) {
	return (
		<table className="w-full rounded overflow-hidden bg-white border border-gray-200">
			<thead className="border-b border-gray-400 bg-gray-100">
				<tr className="text-left border-b">
					<th className="px-4 py-3 font-semibold">Expand</th>
					<TableSortHeader
						field="student"
						label="Student"
						sortField={sortField}
						sortDir={sortDir}
						onSortChange={onSortChange}
						className="px-4 py-3 font-semibold"
					/>
					<TableSortHeader
						field="createdAt"
						label="Created"
						sortField={sortField}
						sortDir={sortDir}
						onSortChange={onSortChange}
						className="px-4 py-3 font-semibold"
					/>
					<TableSortHeader
						field="completedAt"
						label="Completed"
						sortField={sortField}
						sortDir={sortDir}
						onSortChange={onSortChange}
						className="px-4 py-3 font-semibold"
					/>
					<th className="px-4 py-3 font-semibold">Score</th>
				</tr>
			</thead>
			<tbody>
				<SessionFeedbackRow
					rows={rows}
					busy={busy}
				/>
			</tbody>
		</table>
	);
}
