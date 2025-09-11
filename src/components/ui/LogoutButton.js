import React from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";

export default function LogoutButton({ className = "" }) {
	const [busy, setBusy] = React.useState(false);

	const { logout, loading } = useAuth();
	const navigate = useNavigate();

	const onClick = async () => {
		if (busy) return;

		setBusy(true);

		try {
			await logout(); // calls /auth/professor/logout (with credentials)
			navigate("/professor", { replace: true });
		} catch (e) {
			console.error("Logout failed:", e);
			// Still send the user to login;
			navigate("/professor", { replace: true });
		} finally {
			setBusy(false);
		}
	};

	return (
		<button
			onClick={onClick}
			disabled={busy || loading}
			title="Sign out"
			className={[
				"inline-flex items-center gap-1",
				"px-3 py-1.5 text-sm font-medium rounded",
				"border border-gray-400 bg-white text-gray-800",
				"hover:bg-gray-50 disabled:opacity-60",
				className,
			].join(" ")}
		>
			{busy ? "Signing out…" : "Sign out"}
		</button>
	);
}
