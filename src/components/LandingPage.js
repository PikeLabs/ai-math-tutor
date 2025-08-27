import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../contexts/SessionContext";

export default function LandingPage() {
	const navigate = useNavigate();
	const { sessionId, studentName } = useSession();

	// Track the user's current selection (for visual feedback, tests, analytics, etc.)
	const [selectedRole, setSelectedRole] = useState(null); // 'student' | 'professor' | null

	const onStudent = () => {
		setSelectedRole("student");
		if (sessionId) navigate("/student");
		else navigate("/start");
	};

	const onProfessor = () => {
		setSelectedRole("professor");
		navigate("/professor");
	};

	return (
		<main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
			<div className="w-full max-w-3xl">
				<h1 className="text-2xl font-semibold mb-6 text-center">Welcome</h1>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					{/* Student card */}
					<button
						type="button"
						onClick={onStudent}
						aria-label="Start or resume student session"
						className={[
							"text-left rounded-2xl border p-6 bg-white transition transform",
							"hover:shadow-md hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500",
							selectedRole === "student" ? "ring-2 ring-blue-500" : "",
						].join(" ")}
					>
						<div className="text-lg font-semibold mb-1">
							{sessionId ? "Resume Student Session" : "Student"}
						</div>
						<p className="text-sm text-gray-600">
							{sessionId
								? `Continue${studentName ? ` as ${studentName}` : ""}.`
								: "Start a new session and present your pitch."}
						</p>
					</button>

					{/* Professor card */}
					<button
						type="button"
						onClick={onProfessor}
						aria-label="Go to professor dashboard"
						className={[
							"text-left rounded-2xl border p-6 bg-white transition transform",
							"hover:shadow-md hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500",
							selectedRole === "professor" ? "ring-2 ring-blue-500" : "",
						].join(" ")}
					>
						<div className="text-lg font-semibold mb-1">Professor</div>
						<p className="text-sm text-gray-600">
							Log in to view student sessions
						</p>
					</button>
				</div>
			</div>
		</main>
	);
}
