import SessionFeedbackRow from "./SessionFeedbackRow";
import TableSortHeader from "../ui/TableSortHeader";

import {
	Table,
	TableHeader,
	TableRow,
	TableHead,
	TableBody,
} from "../ui/table";

export default function SessionFeedbackTable({
	rows = [],
	busy = false,
	sortField,
	sortDir,
	onSortChange,
}) {
	const getThAriaLabel = (column) =>
		sortField === column
			? sortDir === "asc"
				? "ascending"
				: "descending"
			: "none";

	return (
		<div className="rounded-2xl border border-border bg-card overflow-hidden">
			<Table>
				<TableHeader className="bg-muted/40">
					<TableRow>
						<TableHead
							className="px-4 py-3 text-foreground/80 font-semibold"
							aria-sort={getThAriaLabel("student")}
						>
							<TableSortHeader
								field="student"
								label="Student"
								sortField={sortField}
								sortDir={sortDir}
								onSortChange={onSortChange}
							/>
						</TableHead>

						<TableHead
							className="px-4 py-3 text-foreground/80 font-semibold"
							aria-sort={getThAriaLabel("createdAt")}
						>
							<TableSortHeader
								field="createdAt"
								label="Created"
								sortField={sortField}
								sortDir={sortDir}
								onSortChange={onSortChange}
							/>
						</TableHead>

						<TableHead
							className="px-4 py-3 text-foreground/80 font-semibold"
							aria-sort={getThAriaLabel("completedAt")}
						>
							<TableSortHeader
								field="completedAt"
								label="Completed"
								sortField={sortField}
								sortDir={sortDir}
								onSortChange={onSortChange}
							/>
						</TableHead>

						<TableHead
							className="px-4 py-3 text-foreground/80 font-semibold text-center"
							aria-sort={getThAriaLabel("presentationScore")}
						>
							Score
						</TableHead>
					</TableRow>
				</TableHeader>

				<TableBody>
					<SessionFeedbackRow
						rows={rows}
						busy={busy}
					/>
				</TableBody>
			</Table>
		</div>
	);
}
