import React from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Upload } from "lucide-react";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { RecordingIcon } from "../ui/RecordingIcon";
import { cn } from "../../lib/utils";

const modalBtn =
	"h-auto px-6 py-3 text-base font-semibold " +
	"shadow-none hover:shadow-none " +
	"transition-all duration-150 will-change-transform " +
	"hover:-translate-y-0.5 active:translate-y-0 " +
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default function RecordPromptModal({
	open,
	onClose,
	onStart,
	onUploadDifferent,
}) {
	const handleOpenChange = (isOpen) => {
		if (!isOpen) onClose?.();
	};

	const handleBlockEscapes = (e) => e.preventDefault();

	return (
		<Dialog
			open={open}
			onOpenChange={handleOpenChange}
		>
			<DialogContent
				// Block ESC and outside clicks from closing the dialog
				onEscapeKeyDown={handleBlockEscapes}
				onPointerDownOutside={handleBlockEscapes}
				className="sm:max-w-[32rem] rounded-2xl border-none shadow-xl"
				hideClose={true}
			>
				{/* Extra hidden title ensures no timing issues during mount/HMR */}
				<DialogTitle asChild>
					<VisuallyHidden>Recording prompt</VisuallyHidden>
				</DialogTitle>

				<DialogHeader>
					<DialogTitle
						id="record-start-title"
						className="text-xl"
					>
						Ready to record your presentation?
					</DialogTitle>
					<DialogDescription className="sr-only">
						Start recording narration or upload a different file.
					</DialogDescription>
				</DialogHeader>

				<p className="text-sm text-muted-foreground/50 mb-6">
					Click start to begin recording your narration. You can also upload a
					different file.
				</p>

				<div className="flex items-center justify-center gap-2.5 md:gap-3">
					<Button
						type="button"
						onClick={onStart}
						variant="destructive"
						className={cn("border-0", modalBtn)}
					>
						<RecordingIcon className="mr-2 h-4 w-4" />
						Start recording
					</Button>
					<Button
						type="button"
						onClick={onUploadDifferent}
						variant="secondary"
						className={modalBtn}
					>
						<Upload className="mr-2 h-4 w-4" />
						Upload different file
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
