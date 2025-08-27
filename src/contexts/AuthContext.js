import React, {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	professorLogin,
	professorLogout,
	checkIsProfessor,
} from "../services/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
	const [isProfessor, setIsProfessor] = useState(false);
	const [loading, setLoading] = useState(true);

	// bootstrap from /auth/me
	useEffect(() => {
		(async () => {
			try {
                const data = await checkIsProfessor()
				setIsProfessor(!!data.isProfessor);
			} catch (e) {
				setIsProfessor(false);
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	const login = async (password) => {
		// const r = await fetch(API("/auth/professor"), {
		// 	method: "POST",
		// 	headers: { "Content-Type": "application/json" },
		// 	credentials: "include", // IMPORTANT: set cookie
		// 	body: JSON.stringify({ password }),
		// });
        try {
            const data = await professorLogin(password);
            console.log("Login data:", data);
            // TODO: Add check here...
            setIsProfessor(true);
        } catch (error) {
            setIsProfessor(false);
            console.error("Login failed:", error);
            throw error;
        }
		return true;
	};

	const logout = async () => {
        await professorLogout();
		// await fetch(API("/auth/logout"), {
		// 	method: "POST",
		// 	credentials: "include",
		// });
		setIsProfessor(false);
	};

	const value = useMemo(
		() => ({ isProfessor, loading, login, logout }),
		[isProfessor, loading]
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
