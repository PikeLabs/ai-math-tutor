import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ redirectTo = "/professor" }) {
	const { loading, isProfessor } = useAuth();
	if (loading) return <div className="p-6 text-center">Checking access…</div>;
	return isProfessor ? (
		<Outlet />
	) : (
		<Navigate
			to={redirectTo}
			replace
		/>
	);
}
