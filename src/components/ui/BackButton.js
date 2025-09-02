export default function BackButton({ onClick, buttonText = "← Back to Home" }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="text-blue-600 hover:underline text-md mb-4"
			aria-label="Go back to landing page"
		>
			{buttonText}
		</button>
	);
}
