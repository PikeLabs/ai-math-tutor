import { useContext } from "react";
import { AppContext } from "../contexts/AppContext";

export function useAppContext() {
	return useContext(AppContext);
}
