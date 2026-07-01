import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { theme } from './theme';

// Layout
import Layout from './components/Layout';

// Pages
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import WorkerDashboard from './pages/WorkerDashboard';
import Users from './pages/Users';
import Categories from './pages/Categories';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Sales from './pages/Sales';
import Payments from './pages/Payments';
import Installments from './pages/Installments';
import InterestRates from './pages/InterestRates';
import Settings from './pages/Settings';
import Reports from './pages/Reports';

// Role Guard Component
interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('admin' | 'worker')[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return null; // or loading spinner
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If worker tries to visit admin pages, send them back to worker dashboard
    if (user.role === 'worker') {
      return <Navigate to="/worker-dashboard" replace />;
    }
    return <Navigate to="/admin-dashboard" replace />;
  }

  return <>{children}</>;
};

export const AppContent: React.FC = () => {
  const { user } = useAuth();
  
  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to={user.role === 'admin' ? '/admin-dashboard' : '/worker-dashboard'} replace />} />
      
      {/* Shared and Worker Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to={user?.role === 'admin' ? '/admin-dashboard' : '/worker-dashboard'} replace />} />
        
        {/* Worker Dashboard */}
        <Route
          path="worker-dashboard"
          element={
            <ProtectedRoute allowedRoles={['worker']}>
              <WorkerDashboard />
            </ProtectedRoute>
          }
        />
        
        {/* Admin Dashboard */}
        <Route
          path="admin-dashboard"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* Admin Only Screens */}
        <Route
          path="users"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="categories"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Categories />
            </ProtectedRoute>
          }
        />
        <Route
          path="interest-rates"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <InterestRates />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Settings />
            </ProtectedRoute>
          }
        />

        {/* Shared Screens (Admin + Worker) */}
        <Route path="products" element={<Products />} />
        <Route path="customers" element={<Customers />} />
        <Route path="sales" element={<Sales />} />
        <Route path="payments" element={<Payments />} />
        <Route path="installments" element={<Installments />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
