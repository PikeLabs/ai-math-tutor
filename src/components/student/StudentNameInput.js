import { useState } from "react";
import { useNavigate } from "react-router-dom";

import BackButton from "../ui/BackButton";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
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

			navigate("/student", { replace: true });
		} catch (err) {
			setErr(
				err.message ||
					"Failed to create a new student session, please try again"
			);
		} finally {
			setSubmitting(false);
		}
	};

	const errorContent = err && (
		<div
			id="student-name-error"
			role="alert"
			className="text-sm font-medium text-center text-destructive"
		>
			{err}
		</div>
	);

	const handleNameInput = (e) => {
		setName(e.target.value);
	};

	const handleBack = () => navigate("/");

	const disabled = submitting || name.trim().length < 2;
	const buttonText = submitting ? "Creating…" : "Continue";

	return (
		<div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
			<form
				onSubmit={onSubmit}
				className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-sm p-6 space-y-4"
			>
				<BackButton onClick={handleBack} />

				<h1 className="text-xl font-semibold text-center">Welcome 👋</h1>

				<div className="space-y-2">
					<Label
						htmlFor="student-name"
						className="text-muted-foreground/20"
					>
						Your name
					</Label>
					<Input
						id="student-name"
						value={name}
						onChange={handleNameInput}
						placeholder="Ada Lovelace"
						autoFocus
						autoComplete="name"
						required
						aria-invalid={Boolean(err)}
						aria-describedby={err ? "student-name-error" : undefined}
						className="placeholder:text-muted-foreground/60"
					/>
				</div>

				{errorContent}

				<Button
					type="submit"
					disabled={disabled}
					className="block w-1/2 m-auto h-auto border border-border"
				>
					{buttonText}
				</Button>
			</form>
		</div>
	);
}
