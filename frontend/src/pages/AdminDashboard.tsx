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
} from '@mui/material';
import {
  TrendingUp,
  People,
  Inventory,
  Warning,
  Payment,
  AttachMoney,
  OpenInNew,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import apiClient from '../api/client';

interface DashboardKPIs {
  totalRevenue: number;
  totalCustomers: number;
  totalProducts: number;
  inventoryValue: number;
  activeInstallments: number;
  overduePayments: number;
  todayRevenue: number;
  todaySalesCount: number;
}

interface ChartItem {
  period: string;
  revenue: number;
  count: number;
}

interface TopProduct {
  id: string;
  name: string;
  brand: string;
  total_sold: number;
  total_revenue: number;
}

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [chartData, setChartData] = useState<ChartItem[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [kpisRes, chartRes, topRes] = await Promise.all([
          apiClient.get('/reports/dashboard'),
          apiClient.get('/reports/sales-chart?period=daily'),
          apiClient.get('/reports/top-products?limit=5'),
        ]);
        setKpis(kpisRes.data);
        setChartData(chartRes.data || []);
        setTopProducts(topRes.data || []);
      } catch (err: any) {
        console.error(err);
        setError('Failed to load dashboard report statistics.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
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

  const cards = [
    {
      title: 'Total Revenue',
      value: formatCurrency(kpis?.totalRevenue || 0),
      subtitle: `Today: ${formatCurrency(kpis?.todayRevenue || 0)} (${kpis?.todaySalesCount} sales)`,
      icon: <AttachMoney sx={{ fontSize: 32, color: 'success.main' }} />,
    },
    {
      title: 'Inventory Valuation',
      value: formatCurrency(kpis?.inventoryValue || 0),
      subtitle: `${kpis?.totalProducts} Active Products`,
      icon: <Inventory sx={{ fontSize: 32, color: 'primary.main' }} />,
    },
    {
      title: 'Customers Registered',
      value: String(kpis?.totalCustomers || 0),
      subtitle: 'Active profiles in system',
      icon: <People sx={{ fontSize: 32, color: 'info.main' }} />,
    },
    {
      title: 'Active Installments',
      value: String(kpis?.activeInstallments || 0),
      subtitle: `${kpis?.overduePayments || 0} overdue payments pending`,
      icon: <Payment sx={{ fontSize: 32, color: 'secondary.main' }} />,
      alert: (kpis?.overduePayments || 0) > 0,
    },
  ];

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Admin Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Real-time metrics for ElectroStore
        </Typography>
      </Box>

      {kpis && kpis.overduePayments > 0 && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }} action={
          <Button color="inherit" size="small" onClick={() => navigate('/installments?status=overdue')}>
            View Overdue Plans
          </Button>
        }>
          There are {kpis.overduePayments} customer installment plans with overdue balances.
        </Alert>
      )}

      {/* Grid of KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {cards.map((card, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Card sx={{ height: '100%', borderLeft: card.alert ? '4px solid #ef4444' : 'none' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {card.title}
                  </Typography>
                  {card.icon}
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                  {card.value}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {card.subtitle}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Graphs and Tables */}
      <Grid container spacing={3}>
        {/* Sales Chart */}
        <Grid item xs={12} md={8}>
          <Card sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
              Sales History (Last 30 Days)
            </Typography>
            <Box sx={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value) => [`Rs. ${Number(value).toLocaleString()}`, 'Revenue']} />
                  <Area type="monotone" dataKey="revenue" stroke="#4f46e5" fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Grid>

        {/* Top Selling Products */}
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Top Selling Products
              </Typography>
              <Button size="small" endIcon={<OpenInNew />} onClick={() => navigate('/products')}>
                View all
              </Button>
            </Box>
            {topProducts.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">No sales recorded yet</Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ border: 'none' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Qty Sold</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topProducts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell sx={{ fontSize: '0.85rem' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {p.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {p.brand}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{p.total_sold}</TableCell>
                        <TableCell align="right">{formatCurrency(p.total_revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AdminDashboard;
