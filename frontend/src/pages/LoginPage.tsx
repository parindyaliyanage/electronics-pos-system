// FR1 — login
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { errorMessage } from "../api/client";
import { Icon } from "../components/Icon";
import { useAuth } from "../lib/auth-context";
import { APP_NAME } from "../lib/constants";
import { canOpen } from "../lib/navigation";
import { homePath, type UserRole } from "../lib/session";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = "Enter your email address.";
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = "Enter a valid email address, like name@example.com.";
  if (!password) errors.password = "Enter your password.";
  return errors;
}

export default function LoginPage() {
  const { user, signIn, signOutReason } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Return to the page that needed a sign-in, if this role may open it.
  const target = (role: UserRole) => (from && canOpen(role, from.split("?")[0]) ? from : homePath(role));

  if (user) return <Navigate to={target(user.role)} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    const errors = validate(email, password);
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const signedIn = await signIn(email.trim(), password);
      navigate(target(signedIn.role), { replace: true });
    } catch (error) {
      // The server deliberately doesn't say whether the email or the password was wrong.
      setFormError(
        axios.isAxiosError(error) && error.response?.status === 401
          ? "Incorrect email or password."
          : errorMessage(error),
      );
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  // Re-check a field as the user types once they've tried to submit.
  const update = (field: "email" | "password", value: string) => {
    const next = field === "email" ? { email: value, password } : { email, password: value };
    if (field === "email") setEmail(value);
    else setPassword(value);
    if (touched) setFieldErrors(validate(next.email, next.password));
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">SR</span>
          <span className="brand-name">{APP_NAME}</span>
        </div>
        <h1>Sign in</h1>
        <p className="muted">Electronics point of sale and installment management.</p>

        {signOutReason === "expired" && !formError && (
          <div className="alert alert-info" role="status">Your session has ended. Please sign in again.</div>
        )}
        {formError && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={18} />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <div className={`field${fieldErrors.email ? " has-error" : ""}`}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => update("email", e.target.value)}
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
            />
            {fieldErrors.email && <p className="field-error" id="email-error">{fieldErrors.email}</p>}
          </div>
          <div className={`field${fieldErrors.password ? " has-error" : ""}`}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => update("password", e.target.value)}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
            />
            {fieldErrors.password && <p className="field-error" id="password-error">{fieldErrors.password}</p>}
          </div>
          <button type="submit" className="button button-primary button-block" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
