import React, {
	createContext,
	useContext,
	useState,
	useEffect,
	useMemo,
} from "react";

const SessionCtx = createContext(null);

export function useSession() {
	return useContext(SessionCtx);
}

export function SessionProvider({ children }) {
	const [sessionId, setSessionId] = useState(
		() => sessionStorage.getItem("sessionId") || ""
	);
	const [studentId, setStudentId] = useState(
		() => sessionStorage.getItem("studentId") || ""
	);
	const [studentName, setStudentName] = useState(
		() => sessionStorage.getItem("studentName") || ""
	);

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

	const clearSessionStorage = () => {
		setSessionId("");
		setStudentId("");
		setStudentName("");
		sessionStorage.removeItem("sessionId");
		sessionStorage.removeItem("studentId");
		sessionStorage.removeItem("studentName");
	};

	const value = useMemo(
		() => ({
			clearSession: clearSessionStorage,
			sessionId,
			setSessionId,
			studentId,
			setStudentId,
			studentName,
			setStudentName,
		}),
		[sessionId, studentId, studentName]
	);

	return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
