import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import PDFViewer from "./PDFViewer";

import { useSession } from "./contexts/SessionContext";

// import Feedback from "./Feedback";
import { AppProvider } from "./contexts/AppContext";
import RequireSession from "./components/RequireSession";
import StudentNameInput from "./components/StudentNameInput";
import ChatApp from "./components/ChatApp";
import Dashboard from "./components/professor/Dashboard";
import Sessions from "./components/professor/Sessions";
import FeedbackPage from "./pages/FeedbackPage";
import LandingPage from "./components/LandingPage";
import InstructionsModal from "./components/modal/InstructionsModal";

import "./App.css";

function AppShell({ sessionId, hasSeenInstructions, markInstructionsSeen }) {
	return (
		<Router>
			<Routes>
				<Route
					path="/"
					element={<LandingPage />}
				/>

				<Route
					path="/start"
					element={<StudentNameInput />}
				/>
				<Route
					path="/student"
					element={
						<RequireSession>
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
						</RequireSession>
					}
				/>

				<Route
					path="/professor"
					element={<Dashboard />}
				/>
				{/* TODO: Sessions should be SessionDetail and reflect the old Feedback Display */}
				<Route
					path="/professor/session/:id"
					element={<Sessions />}
				/>
				<Route
					path="/feedback"
					element={<FeedbackPage />}
				/>
			</Routes>
		</Router>
	);
}

export default function App() {
	const { sessionId, hasSeenInstructions, markInstructionsSeen } = useSession();
	return (
		<AppProvider sessionId={sessionId}>
			<AppShell
				sessionId={sessionId}
				hasSeenInstructions={hasSeenInstructions}
				markInstructionsSeen={markInstructionsSeen}
			/>
		</AppProvider>
	);
}
