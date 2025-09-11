import React from "react";
import "./Avatar.css";
import professorImage from "./assets/shepheadshot.jpeg";

function Avatar({
	isSpeaking = false,
	isLoading = false,
	isProcessing = false,
}) {
	return (
		<div className="flex items-center justify-center p-4 min-h-[200px]">
			<div className="relative w-[280px] h-[280px] rounded-full overflow-hidden shadow-2xl transition-transform duration-300 hover:scale-105">
				<img
					src={professorImage}
					alt="Professor"
					className="w-full h-full object-cover rounded-full"
				/>

				{isSpeaking && (
					<div
						className="pointer-events-none absolute inset-[-6px] z-10 rounded-full border-[3px] border-green-600 animate-pulse-speak"
						aria-hidden="true"
					/>
				)}

				{isLoading && (
					<div
						className="pointer-events-none absolute inset-[-6px] z-10 rounded-full border-[3px] border-muted-foreground/20 border-t-blue-600 animate-spin"
						aria-hidden="true"
					/>
				)}

				{isProcessing && (
					<div
						className="pointer-events-none absolute inset-[-6px] z-10 rounded-full border-[3px] border-orange-500 animate-pulse-process"
						aria-hidden="true"
					/>
				)}
			</div>
		</div>
	);
}

export default Avatar;
