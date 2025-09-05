import { useState } from "react";
import { useNavigate } from "react-router-dom";

import BackButton from "../ui/BackButton";
import { useSession } from "../../hooks/useSession";
import { createSession } from "../../services/api";

export default function StudentNameInput() {
	const [name, setName] = useState("");
	const [err, setErr] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const { setSessionId, setStudentId, setStudentName } = useSession();
	const navigate = useNavigate();

	const onSubmit = async (e) => {
		e.preventDefault();
		if (name.trim().length < 2) {
			setErr("Name must be at least 2 characters long");
			return;
		}

		setErr("");
		setSubmitting(true);

		try {
			const res = await createSession({ studentName: name.trim() });

			setStudentName(name.trim());
			setSessionId(res.sessionId);
			setStudentId(res.studentId);

			navigate("/student");
		} catch (err) {
			setErr(
				err.message ||
					"Failed to create a new student session, please try again"
			);
			console.error("Failed to create session:", err);
		} finally {
			setSubmitting(false);
		}
	};

	const errorContent = err && (
		<div className="text-red-600 text-md font-medium text-center">{err}</div>
	);

	const handleNameInput = (e) => {
		setName(e.target.value);
	};

	const handleBack = () => navigate("/");

	const disabled = submitting || name.trim().length < 2;
	const buttonText = submitting ? "Creating…" : "Continue";

	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
			<form
				onSubmit={onSubmit}
				className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4"
			>
				<BackButton onClick={handleBack} />

				<h1 className="text-xl font-semibold text-center">Welcome 👋</h1>

				<label className="block text-sm">
					<span className="text-gray-700">Your name</span>
					<input
						className="mt-1 w-full border rounded px-3 py-2 focus:outline-none focus:ring focus:border-blue-500"
						value={name}
						onChange={handleNameInput}
						placeholder="Ada Lovelace"
						autoFocus
						aria-label="Student name"
					/>
				</label>

				{errorContent}

				<button
					disabled={disabled}
					className="w-full py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
				>
					{buttonText}
				</button>
			</form>
		</div>
	);
}
