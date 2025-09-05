import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import AppProvider from "./contexts/AppContext";
import AuthProvider from "./contexts/AuthContext";

import Dashboard from "./components/professor/Dashboard";
import LandingPage from "./components/LandingPage";
import Login from "./components/professor/Login";
import StudentFlow from "./components/student/StudentFlow";
import StudentNameInput from "./components/student/StudentNameInput";
import StudentRoute from "./components/routes/StudentRoute";
import ProfessorRoute from "./components/routes/ProfessorRoute";
import FeedbackPage from "./pages/FeedbackPage";
import { useSession } from "./hooks/useSession";

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
				<Route element={<ProfessorRoute />}>
					<Route
						path="/professor/dashboard"
						element={<Dashboard />}
					/>
				</Route>

				<Route element={<StudentRoute />}>
					<Route
						path="/start"
						element={<StudentNameInput />}
					/>
					<Route
						path="/student"
						element={<StudentFlow />}
					/>

					<Route
						path="/feedback"
						element={<FeedbackPage />}
					/>
				</Route>
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
