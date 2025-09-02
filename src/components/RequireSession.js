import { Navigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";

export default function RequireSession({ children }) {
	const { sessionId } = useSession();
	if (!sessionId)
		return (
			<Navigate
				to="/start"
				replace
			/>
		);
	return children;
}
