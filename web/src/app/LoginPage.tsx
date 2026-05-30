import { useState, type FormEvent } from "react";
import { api } from "../data/apiClient";
import type { AuthUser } from "../contracts/api";

type LoginPageProps = {
  onLoginSuccess: (user: AuthUser) => void;
};

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password || loading) return;

    setError("");
    setLoading(true);

    try {
      const result = await api.login({ username: trimmedUsername, password });
      onLoginSuccess(result.user);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Too many login attempts")) {
        setError("Too many login attempts. Please wait a moment and try again.");
      } else {
        setError("Invalid username or password.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">kiss<span className="login-title-accent">_ai</span></h1>
          <p className="login-subtitle">Sign in to continue</p>
        </div>

        {error ? (
          <div className="login-error" role="alert">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 4.5v4M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        ) : null}

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span className="login-label">Username</span>
            <input
              autoComplete="username"
              autoFocus
              className="login-input"
              disabled={loading}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              type="text"
              value={username}
            />
          </label>

          <label className="login-field">
            <span className="login-label">Password</span>
            <input
              autoComplete="current-password"
              className="login-input"
              disabled={loading}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              type="password"
              value={password}
            />
          </label>

          <button
            className="login-button"
            disabled={loading || !username.trim() || !password}
            type="submit"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
