import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

export default function SortHeader({
	field,
	label,
	sortField,
	sortDir = "asc",
	onSortChange,
	className = "",
}) {
	const isActive = sortField === field;
	const nextDir = isActive && sortDir === "asc" ? "desc" : "asc";
	const indicator = isActive ? (sortDir === "asc" ? "▲" : "▼") : "⇅";
	// const indicator = !isActive ? "⇅" : sortDir === "asc" ? "↑" : "↓";

	const handleClick = (e) => {
		e.preventDefault();
		onSortChange?.(field);
	};

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			onClick={handleClick}
			className={cn(
				"h-auto px-0 inline-flex items-center gap-1 underline-offset-4 hover:underline",
				"bg-transparent hover:bg-transparent active:bg-transparent",
				"focus-visible:ring-0 focus-visible:ring-offset-0",
				className
			)}
			aria-pressed={isActive ? "true" : "false"}
			title={`Sort by ${label} (${nextDir})`}
		>
			<span className="text-foreground/80">{label}</span>
			<span aria-hidden="true">{indicator}</span>
		</Button>
	);
}
