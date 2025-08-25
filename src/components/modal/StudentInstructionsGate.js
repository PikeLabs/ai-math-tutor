import React, { useEffect, useState } from "react";
import InstructionsModal from "./InstructionsModal";

const SEEN_KEY = "hasSeenInstructions";

export default function StudentInstructionsGate() {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const hasSeen = sessionStorage.getItem(SEEN_KEY) === "1";
		if (!hasSeen) setOpen(true);
	}, []);

	const handleClose = () => {
		sessionStorage.setItem(SEEN_KEY, "1"); // don’t show again this tab
		setOpen(false);
	};

	return (
		<InstructionsModal
			open={open}
			onClose={handleClose}
		/>
	);
}
