import { Button } from "./button";
import { cn } from "../../lib/utils";

export default function BackButton({
	onClick,
	ariaLabel = "Return to Home",
	buttonText = "← Back to Home",
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			onClick={onClick}
			aria-label={ariaLabel}
			title={ariaLabel}
			className={cn(
				"text-primary hover:underline", // link-like look
				"rounded-md px-1 mb-4", // space for focus ring + spacing
				"h-auto" // don't force h-10
			)}
		>
			{buttonText}
		</Button>
	);
}
