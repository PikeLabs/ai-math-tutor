import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import BackButton from "../ui/BackButton";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useAuth } from "../../hooks/useAuth";

const MAX_LENGTH = 50;

export default function Login() {
	const [password, setPassword] = useState("");
	const [err, setErr] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const { login } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();

	const onSubmit = async (e) => {
		e.preventDefault();
		if (!password.trim().length) return;
		if (password.trim().length > MAX_LENGTH) {
			setErr(`Password must be at most ${MAX_LENGTH} characters long`);
			return;
		}

		setErr("");
		setSubmitting(true);

		try {
			await login(password);
			const from = location.state?.from || "/professor/dashboard";
			navigate(from, { replace: true });
		} catch (e) {
			setErr(e.message || "Login Failed");
			setPassword("");
		} finally {
			setSubmitting(false);
		}
	};

	const errorContent = err && (
		<div
			id="prof-password-error"
			role="alert"
			className="text-destructive text-sm font-medium text-center"
		>
			{err}
		</div>
	);

	const handlePasswordInput = (e) => {
		setPassword(e.target.value);
	};

	const handleBack = () => navigate("/");

	const disabled = submitting || !password.trim().length;
	const buttonText = submitting ? "Signing in…" : "Sign In";

	return (
		<div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
			<form
				onSubmit={onSubmit}
				className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-sm p-6 space-y-4"
			>
				<BackButton onClick={handleBack} />

				<h1 className="text-xl font-semibold text-center">Professor Login</h1>

				<div className="space-y-2">
					<Label
						htmlFor="prof-password"
						className="text-muted-foreground"
					>
						Password
					</Label>
					<Input
						id="prof-password"
						value={password}
						onChange={handlePasswordInput}
						autoFocus
						autoComplete="current-password"
						required
						maxLength={MAX_LENGTH}
						type="password"
						aria-label="Professor password"
						aria-invalid={Boolean(err)}
						aria-describedby={err ? "prof-password-error" : undefined}
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
