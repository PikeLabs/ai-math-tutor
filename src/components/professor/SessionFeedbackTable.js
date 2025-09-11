import SessionFeedbackRow from "./SessionFeedbackRow";
import TableSortHeader from "../ui/TableSortHeader";
import {
	Table,
	TableHeader,
	TableRow,
	TableHead,
	TableBody,
	TableCell,
} from "../ui/table";

export default function SessionFeedbackTable({
	rows = [],
	busy = false,
	sortField,
	sortDir,
	onSortChange,
}) {
	return (
		<div className="rounded-2xl border border-border bg-card overflow-hidden">
			<Table>
				<TableHeader className="bg-muted/40">
					<TableRow>
						<TableHead className="w-[84px] px-4 py-3 text-foreground font-semibold">
							Expand
						</TableHead>

						<TableHead className="px-4 py-3">
							<TableSortHeader
								field="student"
								label="Student"
								sortField={sortField}
								sortDir={sortDir}
								onSortChange={onSortChange}
								className="font-semibold"
							/>
						</TableHead>

						<TableHead className="px-4 py-3">
							<TableSortHeader
								field="createdAt"
								label="Created"
								sortField={sortField}
								sortDir={sortDir}
								onSortChange={onSortChange}
								className="font-semibold"
							/>
						</TableHead>

						<TableHead className="px-4 py-3">
							<TableSortHeader
								field="completedAt"
								label="Completed"
								sortField={sortField}
								sortDir={sortDir}
								onSortChange={onSortChange}
								className="font-semibold"
							/>
						</TableHead>

						<TableHead className="px-4 py-3 text-foreground font-semibold">
							Score
						</TableHead>
					</TableRow>
				</TableHeader>

				<TableBody>
					{/* Keep your existing row renderer */}
					<SessionFeedbackRow
						rows={rows}
						busy={busy}
					/>

					{/* Nice empty state when not busy */}
					{!busy && (!rows || rows.length === 0) && (
						<TableRow>
							<TableCell
								colSpan={5}
								className="h-24 text-center text-sm text-muted-foreground"
							>
								No sessions yet.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
