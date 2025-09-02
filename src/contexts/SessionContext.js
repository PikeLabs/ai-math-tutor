import { createContext, useState, useEffect, useMemo } from "react";

export const SessionCtx = createContext(null);

const SEEN_KEY = "hasSeenInstructions";
export default function SessionProvider({ children }) {
	const [sessionId, setSessionId] = useState(
		() => sessionStorage.getItem("sessionId") || ""
	);
	const [studentId, setStudentId] = useState(
		() => sessionStorage.getItem("studentId") || ""
	);
	const [studentName, setStudentName] = useState(
		() => sessionStorage.getItem("studentName") || ""
	);
	const [hasSeenInstructions, setHasSeenInstructions] = useState(
		() => sessionStorage.getItem(SEEN_KEY) === "1"
	);

	// TODO: incorporate these into PDFViewer, FeedbackPage, etc...
	// const [currentPDFUploadId, setCurrentPDFUploadId] = useState(
	// 	() => sessionStorage.getItem("currentPDFUploadId") || ""
	// );
	// const [previousUploadId, setPreviousUploadId] = useState(
	// 	() => sessionStorage.getItem("previousUploadId") || ""
	// );
	// const [currentPDFSlideCount, setCurrentPDFSlideCount] = useState(
	// 	() => sessionStorage.getItem("currentPDFSlideCount") || ""
	// );
	// const [currentPDFS3Url, setCurrentPDFS3Url] = useState(
	// 	() => sessionStorage.getItem("currentPDFS3Url") || ""
	// );
	// const [pitchFeedback, setPitchFeedback] = useState(
	// 	() => sessionStorage.getItem("pitchFeedback") || ""
	// );

	useEffect(() => {
		sessionId
			? sessionStorage.setItem("sessionId", sessionId)
			: sessionStorage.removeItem("sessionId");
	}, [sessionId]);

	useEffect(() => {
		studentId
			? sessionStorage.setItem("studentId", studentId)
			: sessionStorage.removeItem("studentId");
	}, [studentId]);

	useEffect(() => {
		studentName
			? sessionStorage.setItem("studentName", studentName)
			: sessionStorage.removeItem("studentName");
	}, [studentName]);

	useEffect(() => {
		if (hasSeenInstructions) {
			sessionStorage.setItem(SEEN_KEY, "1");
		} else {
			sessionStorage.removeItem(SEEN_KEY);
		}
	}, [hasSeenInstructions]);

	// TODO: Implement
	// useEffect(() => {}, [currentPDFUploadId]);
	// useEffect(() => {}, [previousUploadId]);
	// useEffect(() => {}, [currentPDFSlideCount]);
	// useEffect(() => {}, [currentPDFS3Url]);
	// useEffect(() => {}, [pitchFeedback]);

	const clearSessionStorage = () => {
		setSessionId("");
		setStudentId("");
		setStudentName("");
		setHasSeenInstructions(false);
		sessionStorage.removeItem("sessionId");
		sessionStorage.removeItem("studentId");
		sessionStorage.removeItem("studentName");
		sessionStorage.removeItem(SEEN_KEY);
	};

	const markInstructionsSeen = () => setHasSeenInstructions(true);
	const resetInstructionsSeen = () => setHasSeenInstructions(false);

	const value = useMemo(
		() => ({
			clearSession: clearSessionStorage,
			hasSeenInstructions,
			markInstructionsSeen,
			resetInstructionsSeen,
			sessionId,
			setSessionId,
			setStudentId,
			setStudentName,
			studentId,
			studentName,
		}),
		[sessionId, studentId, studentName, hasSeenInstructions]
	);

	return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
