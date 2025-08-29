export default function SortHeader({
	field,
	label,
	sortField,
	sortDir,
	onSortChange,
	className,
}) {
	const isActive = sortField === field;
	const arrow = !isActive ? "⇅" : sortDir === "asc" ? "↑" : "↓";
	return (
		<th
			className={`cursor-pointer select-none ${className || ""}`}
			onClick={() => onSortChange(field)}
			aria-sort={
				isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none"
			}
			scope="col"
		>
			<span className={isActive ? "font-semibold" : ""}>
				{label} <span className="opacity-60">{arrow}</span>
			</span>
		</th>
	);
}
