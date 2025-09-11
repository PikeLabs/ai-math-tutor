import React from "react";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";

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
				aria-labelledby="record-start-title"
				className="sm:max-w-[32rem] rounded-2xl"
				hideClose={true}
			>
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

				<div className="flex items-center justify-center gap-3">
					<Button
						type="button"
						onClick={onStart}
						variant="destructive"
						className="h-auto px-6 py-3"
					>
						Start recording
					</Button>
					<Button
						type="button"
						onClick={onUploadDifferent}
						variant="outline"
						className="h-auto px-6 py-3"
					>
						Upload different file
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
