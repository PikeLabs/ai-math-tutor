import InstructionsModal from "../modal/InstructionsModal";
import PDFViewer from "../PDFViewer";
import ChatApp from "../ChatApp";
import { useSession } from "../../hooks/useSession";

export default function StudentFlow() {
	const { hasSeenInstructions, markInstructionsSeen } = useSession();

	return (
		<div className="h-screen overflow-hidden p-5 flex flex-col">
			<InstructionsModal
				open={!hasSeenInstructions}
				onClose={markInstructionsSeen}
			/>

			<div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0 overflow-hidden">
				<div className="lg:col-span-3 bg-card border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-0 h-full">
					<PDFViewer />
				</div>

				<div className="lg:col-span-2 flex min-h-0 h-full">
					<div className="w-full bg-card border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-0 h-full">
						<ChatApp />
					</div>
				</div>
			</div>
		</div>
	);
}
