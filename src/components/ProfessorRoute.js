import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProfessorRoute({ redirectTo = "/professor" }) {
	const { loading, isProfessor } = useAuth();
	const location = useLocation();

	if (loading) return <div className="p-6 font-medium text-md text-center">Checking access…</div>;

	return isProfessor ? (
		<Outlet />
	) : (
		<Navigate
			to={redirectTo}
			replace
			state={{ from: location.pathname }}
		/>
	);
}
