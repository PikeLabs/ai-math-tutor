import React from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../ui/button";
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
			// Still send the user to login;
			navigate("/professor", { replace: true });
		} finally {
			setBusy(false);
		}
	};

	return (
		<Button
			onClick={onClick}
			disabled={busy || loading}
			title="Sign out"
			variant="outline"
			className={["h-auto inline-flex items-center gap-2", className].join(" ")}
		>
			{busy ? "Signing out…" : "Sign out"}
		</Button>
	);
}
