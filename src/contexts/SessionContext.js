import {
	createContext,
	useState,
	useEffect,
	useMemo,
	useCallback,
} from "react";
import { safeParse } from "../utils/feedback.utils";

export const SessionCtx = createContext(null);

const SEEN_KEY = "hasSeenInstructions";
const SESSION_ID_KEY = "sessionId";
const STUDENT_ID_KEY = "studentId";
const STUDENT_NAME_KEY = "studentName";

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

	const getPitchFeedback = useCallback(() => {
		const raw = sessionStorage.getItem(PITCH_FEEDBACK_KEY);
		return safeParse(raw);
	}, []);

	const setPitchFeedback = useCallback((json) => {
		if (json === null) {
			sessionStorage.removeItem(PITCH_FEEDBACK_KEY);
		} else {
			sessionStorage.setItem(PITCH_FEEDBACK_KEY, JSON.stringify(json));
		}
	}, []);

	const clearSessionStorage = useCallback(() => {
		setSessionId("");
		setStudentId("");
		setStudentName("");
		setHasSeenInstructions(false);
		sessionStorage.removeItem(SESSION_ID_KEY);
		sessionStorage.removeItem(STUDENT_ID_KEY);
		sessionStorage.removeItem(STUDENT_NAME_KEY);
		sessionStorage.removeItem(SEEN_KEY);

		setPitchFeedback();
	}, [setPitchFeedback]);

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

			getPitchFeedback,
			setPitchFeedback,
		}),
		[
			sessionId,
			studentId,
			studentName,
			hasSeenInstructions,
			clearSessionStorage,
			getPitchFeedback,
			setPitchFeedback,
		]
	);

	return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
