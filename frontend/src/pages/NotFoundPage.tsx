import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { homePath } from "../lib/session";

export default function NotFoundPage() {
  const { user } = useAuth();
  return (
    <div className="empty-state">
      <h2>Page not found</h2>
      <p>The page you were looking for doesn't exist.</p>
      <Link className="button button-primary" to={user ? homePath(user.role) : "/login"}>Go to home</Link>
    </div>
  );
}
