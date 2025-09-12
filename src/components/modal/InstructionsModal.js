import React from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from "../ui/dialog";
import { Button } from "../ui/button";

const modalBtn =
	"h-auto px-6 py-3 text-base font-semibold " +
	"shadow-none hover:shadow-none " +
	"transition-all duration-150 will-change-transform " +
	"hover:-translate-y-0.5 active:translate-y-0 " +
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default function InstructionsModal({ open, onClose }) {
	const handleClose = (isOpen) => {
		if (!isOpen) onClose?.();
	};

	return (
		<Dialog
			open={open}
			onOpenChange={handleClose}
		>
			<DialogContent className="sm:max-w-[32rem] rounded-2xl">
				{/* Extra hidden title ensures no timing issues during mount/HMR */}
				<DialogTitle asChild>
					<VisuallyHidden>Recording prompt</VisuallyHidden>
				</DialogTitle>

				<DialogHeader>
					<DialogTitle
						id="instructions-title"
						className="text-xl"
					>
						How this works
					</DialogTitle>

					<DialogDescription className="sr-only">
						Instructions for the student presentation flow
					</DialogDescription>
				</DialogHeader>

				<ol className="list-decimal ml-5 space-y-2 text-sm text-muted-foreground/50">
					<li>Upload the slide deck for your presentation.</li>
					<li>Start the recording and begin presenting.</li>
					<li>
						Every few slides, your professor will interrupt with questions.
						You&apos;ll have up to 30 seconds to answer (or click{" "}
						<em>Continue</em> to move on).
					</li>
					<li>
						At the end, you&apos;ll receive feedback on your presentation.
					</li>
				</ol>

				<DialogFooter className="mt-5">
					<DialogClose asChild>
						<Button
							type="button"
							variant="outline"
							className={modalBtn}
						>
							Got it
						</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
