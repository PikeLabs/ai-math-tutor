export function RecordingIcon({ size = 20, className = "" }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			aria-hidden="true"
			className={className}
		>
			{/* Simple "record" dot (filled circle) */}
			<circle
				cx="12"
				cy="12"
				r="10"
				fill="currentColor"
			/>
		</svg>
	);
}

export function PausedIcon({ size = 20, className = "" }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			aria-hidden="true"
			className={className}
		>
			{/* Outer circle */}
			<path
				d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2Z"
				fill="currentColor"
				opacity="0.2"
			/>
			{/* Pause bars */}
			<rect
				x="9"
				y="8.5"
				width="2.2"
				height="7"
				rx="1"
				fill="currentColor"
			/>
			<rect
				x="12.8"
				y="8.5"
				width="2.2"
				height="7"
				rx="1"
				fill="currentColor"
			/>
		</svg>
	);
}
