import { useContext } from "react";
import { CheckpointContext } from "../contexts/CheckpointContext";

export const useCheckpoint = () => {
	return useContext(CheckpointContext);
};
