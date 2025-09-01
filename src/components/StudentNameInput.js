import React, { useState } from "react";
import { useSession } from "../contexts/SessionContext";
import { createSession } from "../services/api";
import { useNavigate } from "react-router-dom";

export default function StudentNameInput() {
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const { setSessionId, setStudentId, setStudentName } = useSession();
	const navigate = useNavigate();

	async function onSubmit(e) {
		e.preventDefault();
		if (name.trim().length < 2) return;
		try {
			setBusy(true);
			const res = await createSession({ studentName: name.trim() });
			setStudentName(name.trim());
			setSessionId(res.sessionId);
			setStudentId(res.studentId);
			navigate("/student"); // or /student/slides if you have that route
		} catch (err) {
            console.error("Failed to create session:", err);
            alert("Failed to create session. Please try again.");
        } finally {
			setBusy(false);
		}
	}

    return (
			<div className="min-h-screen grid place-items-center p-6">
				<form
					onSubmit={onSubmit}
					className="w-full max-w-md space-y-3 border rounded p-6"
				>
					<h1 className="text-xl font-semibold">Welcome 👋</h1>
					<label className="block text-sm font-medium">Your name</label>
					<input
						className="w-full border rounded px-3 py-2"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Ada Lovelace"
					/>
					<button
						disabled={busy || name.trim().length < 2}
						className="px-4 py-2 rounded bg-blue-600 text-white disabled:bg-gray-400"
					>
						{busy ? "Creating…" : "Continue"}
					</button>
				</form>
			</div>
		);
}
