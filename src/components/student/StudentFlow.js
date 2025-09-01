import InstructionsModal from "../modal/InstructionsModal";
import PDFViewer from "../PDFViewer";
import ChatApp from "../ChatApp";
import { useSession } from "../../contexts/SessionContext";

export default function StudentFlow() {
	const { hasSeenInstructions, markInstructionsSeen } = useSession();

	return (
		<div className="App">
			<InstructionsModal
				open={!hasSeenInstructions}
				onClose={markInstructionsSeen}
			/>
			<div className="split-screen-container">
				<div className="pdf-panel">
					<PDFViewer />
				</div>

				<div className="chat-panel">
					<ChatApp />
				</div>
			</div>
		</div>
	);
}
