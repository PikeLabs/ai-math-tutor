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
				const data = await checkIsProfessor();
				setIsProfessor(!!data.isProfessor);
			} catch (e) {
				setIsProfessor(false);
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	const login = async (password) => {
		setIsProfessor(false);

		try {
			await professorLogin(password);

			const { isProfessor } = await checkIsProfessor();
			if (!isProfessor) {
				throw new Error("Invalid Password");
			}

			setIsProfessor(true);
			return true;
		} catch (error) {
			setIsProfessor(false);
			console.error("Login failed:", error);
			throw error;
		}
	};

	const logout = async () => {
		await professorLogout();
		setIsProfessor(false);
	};

	const value = useMemo(
		() => ({ isProfessor, loading, login, logout }),
		[isProfessor, loading]
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
