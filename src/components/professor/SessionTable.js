import SessionTableRow from "./SessionTableRow";
import TableSortHeader from "../ui/TableSortHeader";

export default function SessionTable({
	rows = [],
	busy = false,
	sortField,
	sortDir,
	onSortChange,
}) {
	return (
		<table className="w-full text-sm border rounded overflow-hidden">
			<thead className="bg-gray-50">
				<tr className="text-left border-b">
					<th className="pl-2 w-28">Expand</th>
					<TableSortHeader
						field="student"
						label="Student"
						sortField={sortField}
						sortDir={sortDir}
						onSortChange={onSortChange}
					/>
					<th>Session ID</th>
					<TableSortHeader
						field="createdAt"
						label="Created"
						sortField={sortField}
						sortDir={sortDir}
						onSortChange={onSortChange}
					/>
					<TableSortHeader
						field="completedAt"
						label="Completed"
						sortField={sortField}
						sortDir={sortDir}
						onSortChange={onSortChange}
					/>
					<th>Score</th>
					{/* TODO: Add overall Score Card Column */}
				</tr>
			</thead>
			<tbody>
				<SessionTableRow
					rows={rows}
					busy={busy}
				/>
			</tbody>
		</table>
	);
}
