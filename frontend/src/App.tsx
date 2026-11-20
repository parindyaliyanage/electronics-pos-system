import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { RequireAuth, RequireRole } from "./components/RequireAuth";
import { useAuth } from "./lib/auth-context";
import { homePath } from "./lib/session";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import CustomerDetailPage from "./pages/CustomerDetailPage";
import CustomersPage from "./pages/CustomersPage";
import InstallmentsPage from "./pages/InstallmentsPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import PosPage from "./pages/PosPage";
import ProductsPage from "./pages/ProductsPage";
import ReportsPage from "./pages/ReportsPage";
import UsersPage from "./pages/UsersPage";

const ADMIN = ["ADMINISTRATOR"] as const;

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homePath(user.role) : "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="dashboard" element={<RequireRole roles={[...ADMIN]}><AdminDashboardPage /></RequireRole>} />
        <Route path="admin" element={<Navigate to="/dashboard" replace />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="installments" element={<InstallmentsPage />} />
        <Route path="reports" element={<RequireRole roles={[...ADMIN]}><ReportsPage /></RequireRole>} />
        <Route path="users" element={<RequireRole roles={[...ADMIN]}><UsersPage /></RequireRole>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
