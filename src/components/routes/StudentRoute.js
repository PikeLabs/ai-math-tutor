import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useSession } from "../../hooks/useSession";

/**
 * StudentRoute
 * - Allows access only when NOT a professor.
 * - Requires an active student sessionId.
 * - If professor is logged in, redirect to the professor dashboard.
 * - If no student session, redirect to /start.
 */
export default function StudentRoute({ redirectTo = "/professor/dashboard" }) {
	const { loading, isProfessor } = useAuth();
	const { sessionId } = useSession();
	const location = useLocation();

	if (loading) {
		return (
			<div className="p-6 font-medium text-md text-center">
				Checking access…
			</div>
		);
	}

	// If professor is logged in, don't allow access to student routes
	if (isProfessor) {
		return (
			<Navigate
				to={redirectTo}
				replace
				state={{ from: location.pathname }}
			/>
		);
	}

	// If not professor, require an active student session
	if (!sessionId) {
		return (
			<Navigate
				to="/start"
				replace
				state={{ from: location.pathname }}
			/>
		);
	}

	// Student route allowed
	return <Outlet />;
}
