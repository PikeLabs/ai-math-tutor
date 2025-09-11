import {
	createContext,
	useEffect,
	useMemo,
	useState,
	useCallback,
} from "react";
import {
	professorLogin,
	professorLogout,
	checkIsProfessor,
} from "../services/api";
import { useSession } from "../hooks/useSession";

export const AuthContext = createContext(null);

export default function AuthProvider({ children }) {
	const [isProfessor, setIsProfessor] = useState(false);
	const [loading, setLoading] = useState(true);
	const { clearSession, sessionId } = useSession();

	// bootstrap from /auth/me
	useEffect(() => {
		let alive = true;
		setLoading(true);

		(async () => {
			try {
				if (sessionId) {
					if (alive) setIsProfessor(false);
				} else {
					const data = await checkIsProfessor();
					if (alive) {
						setIsProfessor(!!data.isProfessor);
					}
				}
			} catch (e) {
				if (alive) {
					setIsProfessor(false);
				}
			} finally {
				if (alive) {
					setLoading(false);
				}
			}
		})();

		return () => {
			alive = false;
		};
	}, [sessionId]);

	const login = useCallback(
		async (password) => {
			setIsProfessor(false);

			try {
				await professorLogin(password);

				const { isProfessor } = await checkIsProfessor();
				if (!isProfessor) {
					throw new Error("Invalid Password");
				}

				setIsProfessor(true);
				if (sessionId) clearSession();
				return true;
			} catch (error) {
				setIsProfessor(false);
				throw error;
			}
		},
		[clearSession, sessionId]
	);

	const logout = async () => {
		await professorLogout();
		setIsProfessor(false);
	};

	const value = useMemo(
		() => ({ isProfessor, loading, login, logout }),
		[isProfessor, loading, login]
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
