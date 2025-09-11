// inline icon (no extra deps)
export default function RefreshIcon({ className = "" }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<polyline points="23 4 23 10 17 10" />
			<polyline points="1 20 1 14 7 14" />
			<path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10" />
			<path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14" />
		</svg>
	);
}
