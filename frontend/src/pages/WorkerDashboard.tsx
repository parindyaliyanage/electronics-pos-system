import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Chip,
} from '@mui/material';
import {
  Storefront,
  Receipt,
  Warning,
  Payment,
  AddShoppingCart,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';

interface RecentOrder {
  id: string;
  total: string;
  payment_method: string;
  sale_date: string;
  customer_name: string | null;
}

interface LowStockProduct {
  id: string;
  name: string;
  brand: string;
  stock_quantity: number;
  reorder_level: number;
}

interface RecentPayment {
  amount: string;
  paid_at: string;
  customer_name: string;
  plan_id: string;
}

interface WorkerDashboardData {
  todayRevenue: number;
  todaySalesCount: number;
  recentOrders: RecentOrder[];
  lowStockProducts: LowStockProduct[];
  recentPayments: RecentPayment[];
}

export const WorkerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<WorkerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const res = await apiClient.get('/worker/dashboard');
        setData(res.data);
      } catch (err: any) {
        console.error(err);
        setError('Failed to load store worker dashboard statistics.');
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  const formatCurrency = (val: number) => {
    return `Rs. ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Store Worker Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Process orders, payments, and track store inventory
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddShoppingCart />}
          onClick={() => navigate('/sales')}
          sx={{ py: 1, px: 2, borderRadius: 2 }}
        >
          New Sales Order
        </Button>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6}>
          <Card sx={{ display: 'flex', alignItems: 'center', p: 1 }}>
            <Box sx={{ p: 2, bgcolor: 'rgba(79, 70, 229, 0.08)', borderRadius: 2, mr: 2, ml: 1 }}>
              <Storefront color="primary" sx={{ fontSize: 32 }} />
            </Box>
            <CardContent sx={{ py: '16px !important' }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Your Sales Today
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {formatCurrency(data?.todayRevenue || 0)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Processed {data?.todaySalesCount || 0} orders today
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Card sx={{ display: 'flex', alignItems: 'center', p: 1 }}>
            <Box sx={{ p: 2, bgcolor: 'rgba(16, 185, 129, 0.08)', borderRadius: 2, mr: 2, ml: 1 }}>
              <Payment color="success" sx={{ fontSize: 32 }} />
            </Box>
            <CardContent sx={{ py: '16px !important' }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Recent Payments Processed
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {data?.recentPayments.length || 0} Transactions
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Installment repayments from clients
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Main Sections */}
      <Grid container spacing={3}>
        {/* Recent Orders Table */}
        <Grid item xs={12} md={8}>
          <Card sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Your Recent Sales Orders
            </Typography>
            {data?.recentOrders.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">You haven't processed any orders today.</Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ border: 'none' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Order ID</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Method</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data?.recentOrders.map((order) => (
                      <TableRow key={order.id} hover onClick={() => navigate(`/sales`)} sx={{ cursor: 'pointer' }}>
                        <TableCell sx={{ fontWeight: 600 }}>{order.id.substring(0, 8).toUpperCase()}</TableCell>
                        <TableCell>{order.customer_name || 'Walk-in Customer'}</TableCell>
                        <TableCell>
                          <Chip label={order.payment_method.toUpperCase()} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {formatCurrency(Number(order.total))}
                        </TableCell>
                        <TableCell align="right">
                          {new Date(order.sale_date).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Card>
        </Grid>

        {/* Sidebar Alerts (Low Stock / Payments) */}
        <Grid item xs={12} md={4}>
          <Grid container spacing={3}>
            {/* Low Stock Panel */}
            <Grid item xs={12}>
              <Card sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
                  <Warning color="error" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Low Stock Alerts
                  </Typography>
                </Box>
                {data?.lowStockProducts.length === 0 ? (
                  <Alert severity="success" sx={{ borderRadius: 2 }}>
                    All products are fully stocked!
                  </Alert>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {data?.lowStockProducts.map((p) => (
                      <Box
                        key={p.id}
                        sx={{
                          p: 1.5,
                          border: '1px solid #e2e8f0',
                          borderRadius: 2,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {p.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {p.brand}
                          </Typography>
                        </Box>
                        <Chip
                          label={`${p.stock_quantity} left`}
                          color={p.stock_quantity === 0 ? 'error' : 'warning'}
                          size="small"
                        />
                      </Box>
                    ))}
                  </Box>
                )}
              </Card>
            </Grid>

            {/* Recent Installment Payments */}
            <Grid item xs={12}>
              <Card sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
                  <Receipt color="primary" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Recent Payments
                  </Typography>
                </Box>
                {data?.recentPayments.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No payments processed recently.
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {data?.recentPayments.map((p, idx) => (
                      <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {p.customer_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(p.paid_at).toLocaleString()}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
                          +{formatCurrency(Number(p.amount))}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Card>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
};

export default WorkerDashboard;
