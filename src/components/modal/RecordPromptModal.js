import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

export default function RecordPromptModal({
	open,
	onClose,
	onStart,
	onUploadDifferent,
}) {
	const root =
		typeof document !== "undefined"
			? document.getElementById("modal-root")
			: null;
	const panelRef = useRef(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		if (!open || !root) return;

		setMounted(true);
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		// Block ESC from closing & keep focus in the dialog
		const handleKeyDown = (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
			}
		};
		const handleFocus = () => {
			if (!panelRef.current?.contains(document.activeElement)) {
				panelRef.current?.focus();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		document.addEventListener("focus", handleFocus, true);
		panelRef.current?.focus();

		return () => {
			document.body.style.overflow = prevOverflow;
			window.removeEventListener("keydown", handleKeyDown);
			document.removeEventListener("focus", handleFocus, true);
			setMounted(false);
		};
	}, [open, root]);

	if (!open || !root) return null;

	const opacity = mounted ? "opacity-100" : "opacity-0";
	const scale = mounted ? "scale-100" : "scale-95";
	return ReactDOM.createPortal(
		<div
			className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${opacity}`}
			aria-modal="true"
			role="dialog"
			aria-labelledby="record-start-title"
		>
			<div
				ref={panelRef}
				tabIndex="-1"
				className={`relative max-w-lg w-[92%] sm:w-[32rem] rounded-2xl bg-white shadow-2xl p-6 outline-none transition-transform transition-opacity duration-200 ${opacity} ${scale}`}
			>
				<h2
					id="record-start-title"
					className="text-xl font-semibold mb-4"
				>
					Ready to record your presentation?
				</h2>
				<p className="text-sm text-gray-700 mb-6">
					Click start to begin recording your narration. You can also upload a
					different file.
				</p>

				<div className="flex items-center justify-center gap-3">
					<button
						onClick={onStart}
						className="px-6 py-3 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
					>
						Start recording
					</button>
					<button
						onClick={onUploadDifferent}
						className="px-4 py-2 rounded-md bg-white border border-black text-black hover:bg-gray-50"
					>
						Upload different file
					</button>
				</div>
			</div>
		</div>,
		root
	);
}
