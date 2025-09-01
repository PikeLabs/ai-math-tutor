import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

export default function InstructionsModal({ open, onClose }) {
	const root =
		typeof document !== "undefined"
			? document.getElementById("modal-root")
			: null;

	const panelRef = useRef(null);
	const [mounted, setMounted] = useState(false);

	// Always call hooks; guard side effects inside.
	useEffect(() => {
		if (!open || !root) return;

		setMounted(true); // trigger enter animation
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		const onKeyDown = (e) => {
			if (e.key === "Escape") onClose?.();
		};
		window.addEventListener("keydown", onKeyDown);

		// Focus dialog for accessibility
		panelRef.current?.focus();

		return () => {
			document.body.style.overflow = prevOverflow;
			window.removeEventListener("keydown", onKeyDown);
			setMounted(false);
		};
	}, [open, root, onClose]);

	const handleBackdropClick = (e) => {
		if (e.target === e.currentTarget) onClose?.();
	};

	// If not open or no portal root, render nothing
	if (!open || !root) return null;

	const opacity = mounted ? "opacity-100" : "opacity-0";
	const scale = mounted ? "scale-100" : "scale-95";
	return ReactDOM.createPortal(
		<div
			className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm
                  transition-opacity duration-200 ${opacity}`}
			onClick={handleBackdropClick}
			aria-modal="true"
			role="dialog"
			aria-labelledby="instructions-title"
		>
			<div
				ref={panelRef}
				tabIndex="-1"
				className={`relative max-w-lg w-[92%] sm:w-[32rem] rounded-2xl bg-white shadow-2xl p-6 outline-none
                    transition-transform transition-opacity duration-200 ${opacity} ${scale}`}
			>
				<button
					aria-label="Close"
					onClick={onClose}
					className="absolute right-3 top-3 rounded-full px-2 py-1 text-gray-500 hover:bg-gray-100"
				>
					✕
				</button>
				<h2
					id="instructions-title"
					className="text-xl font-semibold mb-3"
				>
					How this works
				</h2>
				<ol className="list-decimal ml-5 space-y-2 text-sm text-gray-700">
					<li>1. Upload the slide deck for your presentation.</li>
					<li>2. Start the recording and begin presenting.</li>
					<li>
						3. Every few slides, your professor will interrupt with questions.
						You must answer before you can continue.
					</li>
					<li>4. At the end, you’ll receive feedback on your presentation.</li>
				</ol>
				<div className="mt-5 flex justify-end">
					<button
						onClick={onClose}
						className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
					>
						Got it
					</button>
				</div>
			</div>
		</div>,
		root
	);
}
