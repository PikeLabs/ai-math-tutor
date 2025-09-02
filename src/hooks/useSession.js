import { useContext } from "react";
import { SessionCtx } from "../contexts/SessionContext";

export function useSession() {
	return useContext(SessionCtx);
}
