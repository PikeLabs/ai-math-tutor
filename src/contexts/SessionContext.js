import { createContext, useState, useEffect, useMemo } from "react";
import { safeParse } from "../utils/feedback.utils";

export const SessionCtx = createContext(null);

const SEEN_KEY = "hasSeenInstructions";
const SESSION_ID_KEY = "sessionId";
const STUDENT_ID_KEY = "studentId";
const STUDENT_NAME_KEY = "studentName";

const CURRENT_PDF_UPLOAD_ID_KEY = "currentPDFUploadId";
const CURRENT_PDF_SLIDE_COUNT_KEY = "currentPDFSlideCount";
const CURRENT_PDF_S3_URL_KEY = "currentPDFS3Url";
const PITCH_FEEDBACK_KEY = "pitchFeedback";

export default function SessionProvider({ children }) {
	const [sessionId, setSessionId] = useState(
		() => sessionStorage.getItem(SESSION_ID_KEY) || ""
	);
	const [studentId, setStudentId] = useState(
		() => sessionStorage.getItem(STUDENT_ID_KEY) || ""
	);
	const [studentName, setStudentName] = useState(
		() => sessionStorage.getItem(STUDENT_NAME_KEY) || ""
	);
	const [hasSeenInstructions, setHasSeenInstructions] = useState(
		() => sessionStorage.getItem(SEEN_KEY) === "1"
	);

	useEffect(() => {
		sessionId
			? sessionStorage.setItem(SESSION_ID_KEY, sessionId)
			: sessionStorage.removeItem(SESSION_ID_KEY);
	}, [sessionId]);

	useEffect(() => {
		studentId
			? sessionStorage.setItem(STUDENT_ID_KEY, studentId)
			: sessionStorage.removeItem(STUDENT_ID_KEY);
	}, [studentId]);

	useEffect(() => {
		studentName
			? sessionStorage.setItem(STUDENT_NAME_KEY, studentName)
			: sessionStorage.removeItem(STUDENT_NAME_KEY);
	}, [studentName]);

	useEffect(() => {
		if (hasSeenInstructions) {
			sessionStorage.setItem(SEEN_KEY, "1");
		} else {
			sessionStorage.removeItem(SEEN_KEY);
		}
	}, [hasSeenInstructions]);

	const getPdfUploadId = () =>
		sessionStorage.getItem(CURRENT_PDF_UPLOAD_ID_KEY) || "";
	const setPdfUploadId = (uploadId) =>
		uploadId
			? sessionStorage.setItem(CURRENT_PDF_UPLOAD_ID_KEY, uploadId)
			: sessionStorage.removeItem(CURRENT_PDF_UPLOAD_ID_KEY);

	const getPdfSlideCount = () =>
		Number(sessionStorage.getItem(CURRENT_PDF_SLIDE_COUNT_KEY) || 0);
	const setPdfSlideCount = (slide_count) =>
		slide_count
			? sessionStorage.setItem(CURRENT_PDF_SLIDE_COUNT_KEY, String(slide_count))
			: sessionStorage.removeItem(CURRENT_PDF_SLIDE_COUNT_KEY);

	// TODO: I don't think we need these ones...
	const getPdfS3Url = () =>
		sessionStorage.getItem(CURRENT_PDF_S3_URL_KEY) || "";
	const setPdfS3Url = (s3Url) =>
		s3Url
			? sessionStorage.setItem(CURRENT_PDF_S3_URL_KEY, s3Url)
			: sessionStorage.removeItem(CURRENT_PDF_S3_URL_KEY);

	const getPitchFeedback = () => {
		const raw = sessionStorage.getItem(PITCH_FEEDBACK_KEY);
		return safeParse(raw);
	};
	const setPitchFeedback = (json) => {
		if (json === null) {
			sessionStorage.removeItem(PITCH_FEEDBACK_KEY);
		} else {
			sessionStorage.setItem(PITCH_FEEDBACK_KEY, JSON.stringify(json));
		}
	};

	const clearSessionStorage = () => {
		setSessionId("");
		setStudentId("");
		setStudentName("");
		setHasSeenInstructions(false);
		sessionStorage.removeItem(SESSION_ID_KEY);
		sessionStorage.removeItem(STUDENT_ID_KEY);
		sessionStorage.removeItem(STUDENT_NAME_KEY);
		sessionStorage.removeItem(SEEN_KEY);

		setPdfUploadId();
		setPdfSlideCount();
		setPdfS3Url();
		setPitchFeedback();
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

			getPdfUploadId,
			setPdfUploadId,
			getPdfSlideCount,
			setPdfSlideCount,
			getPdfS3Url,
			setPdfS3Url,
			getPitchFeedback,
			setPitchFeedback,
		}),
		[sessionId, studentId, studentName, hasSeenInstructions]
	);

	return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
