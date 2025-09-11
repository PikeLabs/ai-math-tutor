export default function BackButton({
	onClick,
	ariaLabel = "Return to Home",
	buttonText = "← Back to Home",
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="text-blue-600 hover:underline text-md mb-4"
			aria-label={ariaLabel}
			title={ariaLabel}
		>
			{buttonText}
		</button>
	);
}
