import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import BackButton from "../ui/BackButton";
import { useAuth } from "../../hooks/useAuth";

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
		<div className="text-red-600 text-md font-medium text-center">{err}</div>
	);

	const handlePasswordInput = (e) => {
		setPassword(e.target.value);
	};

	const handleBack = () => navigate("/");
	const disabled = submitting || !password.trim().length;
	const buttonText = submitting ? "Signing in…" : "Sign In";

	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
			<form
				onSubmit={onSubmit}
				className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4"
			>
				<BackButton onClick={handleBack} />

				<h1 className="text-xl font-semibold text-center">Professor Login</h1>
				<label className="block text-sm">
					<span className="text-gray-700">Password</span>
					<input
						type="password"
						className="mt-1 w-full border rounded px-3 py-2 focus:outline-none focus:ring focus:border-blue-500"
						value={password}
						onChange={handlePasswordInput}
						autoFocus
						aria-label="Professor password"
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
