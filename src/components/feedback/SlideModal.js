import { useState, useEffect } from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "../ui/dialog";
import { Separator } from "../ui/separator";
import SlideImage from "./SlideImage";
import { cn } from "../../lib/utils";

function SlideModal({ imageUrl, slideNumber, isOpen, onClose }) {
	const [imageError, setImageError] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	// Reset loading/error whenever a new image opens
	useEffect(() => {
		if (isOpen) {
			setImageError(false);
			setIsLoading(true);
		}
	}, [isOpen, imageUrl]);

	const handleOpenChange = (open) => {
		if (!open) onClose?.();
	};

	const handleImageLoad = () => setIsLoading(false);
	const handleImageError = () => {
		setImageError(true);
		setIsLoading(false);
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={handleOpenChange}
		>
			<DialogContent
				aria-labelledby="slide-full-title"
				className="sm:max-w-[90vw] md:max-w-[80vw] rounded-2xl p-0"
			>
				{/* Extra hidden title ensures no timing issues during mount/HMR */}
				<DialogTitle asChild>
					<VisuallyHidden>Recording prompt</VisuallyHidden>
				</DialogTitle>

				<DialogHeader className="px-6 pt-6">
					<DialogTitle
						id="slide-full-title"
						className="text-lg md:text-xl"
					>
						Slide {slideNumber} — Full View
					</DialogTitle>
					<DialogDescription className="sr-only">
						Full-size slide preview
					</DialogDescription>
				</DialogHeader>

				<Separator className="mx-6" />

				{/* Content area: scrollable, centers image */}
				<div className="px-6 py-5">
					<div className="relative flex min-h-[400px] items-center justify-center">
						{/* Loading */}
						{isLoading && !imageError && (
							<div
								className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
								aria-live="polite"
								aria-atomic="true"
							>
								<div className="mr-2 h-5 w-5 rounded-full border-2 border-border border-t-primary animate-spin" />
								Loading slide…
							</div>
						)}

						{/* Success */}
						{!imageError && (
							<SlideImage
								src={imageUrl}
								alt={`Slide ${slideNumber} - Full Size`}
								className={cn(
									"max-h-[70vh] max-w-full object-contain",
									"rounded-md border border-border shadow-sm transition-opacity duration-200",
									isLoading ? "opacity-0 pointer-events-none" : "opacity-100"
								)}
								onLoad={handleImageLoad}
								onError={handleImageError}
							/>
						)}

						{/* Error fallback */}
						{imageError && (
							<div className="flex h-[300px] w-[400px] flex-col items-center justify-center rounded-md border-2 border-dashed border-border bg-muted/40 text-muted-foreground">
								<div className="mb-2 text-5xl">📄</div>
								<div className="text-base">Slide image not available</div>
								<div className="mt-1 text-xs">
									The slide image could not be loaded
								</div>
							</div>
						)}
					</div>
				</div>

				<Separator className="mx-6" />

				{/* Footer note */}
				<div className="px-6 pb-6 pt-4 text-center text-xs text-muted-foreground">
					Press <kbd className="rounded border bg-muted px-1.5 py-0.5">Esc</kbd>{" "}
					or click outside to close
				</div>
			</DialogContent>
		</Dialog>
	);
}

export default SlideModal;
