export default function Chevron({ open }) {
	return (
		<span
			className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}
		>
			▶
		</span>
	);
}