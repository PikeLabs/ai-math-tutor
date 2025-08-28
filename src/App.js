import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

// import Feedback from "./Feedback";
import AppProvider from "./contexts/AppContext";
import AuthProvider from "./contexts/AuthContext";

import Dashboard from "./components/professor/Dashboard";
import FeedbackPage from "./pages/FeedbackPage";
import LandingPage from "./components/LandingPage";
import Login from "./components/professor/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import RequireSession from "./components/RequireSession";
import Sessions from "./components/professor/Sessions";
import StudentFlow from "./components/student/StudentFlow";
import StudentNameInput from "./components/StudentNameInput";
import { useSession } from "./contexts/SessionContext";

import "./App.css";

function AppRoutes() {
	return (
		<Router>
			<Routes>
				<Route
					path="/"
					element={<LandingPage />}
				/>
				<Route
					path="/professor"
					element={<Login />}
				/>
				<Route element={<ProtectedRoute />}>
					<Route
						path="/professor/dashboard"
						element={<Dashboard />}
					/>
					{/* TODO: Sessions should be SessionDetail and reflect the old Feedback Display */}
					<Route
						path="/professor/session/:id"
						element={<Sessions />}
					/>
				</Route>

				<Route
					path="/start"
					element={<StudentNameInput />}
				/>
				<Route
					path="/student"
					element={
						<RequireSession>
							<StudentFlow />
						</RequireSession>
					}
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
	const { sessionId } = useSession();
	return (
		<AuthProvider>
			<AppProvider sessionId={sessionId}>
				<AppRoutes />
			</AppProvider>
		</AuthProvider>
	);
}
