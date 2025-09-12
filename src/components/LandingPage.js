import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "./ui/button";
import { useSession } from "../hooks/useSession";
import { cn } from "../lib/utils";

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
		<main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
			<div className="w-full max-w-3xl">
				<h1 className="text-2xl font-semibold mb-6 text-center text-foreground">
					Welcome
				</h1>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<Button
						variant="ghost"
						type="button"
						onClick={onStudent}
						aria-label="Start or resume student session"
						className={cn(
							"flex-col items-start justify-start text-left gap-2 h-auto",
							"rounded-2xl p-6 transition transform",
							"bg-card border border-border",
							"hover:shadow-md hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							selectedRole === "student" ? "ring-2 ring-ring" : ""
						)}
					>
						<div className="text-lg font-semibold ">
							{sessionId ? "Resume Student Session" : "Student"}
						</div>
						<p className="text-sm text-muted-foreground">
							{sessionId
								? `Continue${studentName ? ` as ${studentName}` : ""}.`
								: "Start a new session and present your pitch."}
						</p>
					</Button>

					<Button
						variant="ghost"
						type="button"
						onClick={onProfessor}
						aria-label="Go to professor dashboard"
						className={cn(
							"flex-col items-start justify-start text-left gap-2 h-auto",
							"rounded-2xl p-6 transition transform",
							"bg-card border border-border",
							"hover:shadow-md hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							selectedRole === "professor" ? "ring-2 ring-ring" : ""
						)}
					>
						<div className="text-lg font-semibold">Professor</div>
						<p className="text-sm text-muted-foreground">
							Log in to view student sessions
						</p>
					</Button>
				</div>
			</div>
		</main>
	);
}
