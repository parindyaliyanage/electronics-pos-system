import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  MenuItem,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  TrendingUp,
  Assessment,
  Inventory,
  Timeline,
} from '@mui/icons-material';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import apiClient from '../api/client';

interface ReportKPIs {
  totalSalesValue: number;
  totalSalesCount: number;
  averageOrderValue: number;
  totalCostOfGoods: number;
  grossProfitMargin: number;
  totalOutstandingFinancing: number;
}

interface ChartItem {
  period: string;
  revenue: number;
  count: number;
}

interface CategorySales {
  category_name: string;
  total_sold: number;
  revenue: number;
}

export const Reports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Report Data
  const [kpis, setKpis] = useState<ReportKPIs | null>(null);
  const [chartData, setChartData] = useState<ChartItem[]>([]);
  const [categorySales, setCategorySales] = useState<CategorySales[]>([]);

  const loadReportData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpisRes, chartRes, catSalesRes] = await Promise.all([
        apiClient.get('/reports/summary'),
        apiClient.get(`/reports/sales-chart?period=${period}`),
        apiClient.get('/reports/category-performance'),
      ]);
      setKpis(kpisRes.data);
      setChartData(chartRes.data || []);
      setCategorySales(catSalesRes.data || []);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load system reports and analytics data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, [period]);

  const formatCurrency = (val: number) => {
    return `Rs. ${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

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

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Reports & Analytics
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Inspect financial revenue, gross margins, inventory turnover and credit risks
          </Typography>
        </Box>
        <TextField
          select
          size="small"
          label="Time Period Grouping"
          value={period}
          onChange={(e: any) => setPeriod(e.target.value)}
          sx={{ width: 180 }}
        >
          <MenuItem value="daily">Daily View (30 Days)</MenuItem>
          <MenuItem value="weekly">Weekly View</MenuItem>
          <MenuItem value="monthly">Monthly View</MenuItem>
        </TextField>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
                Gross Sales Value
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                {kpis && formatCurrency(kpis.totalSalesValue)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                From {kpis?.totalSalesCount || 0} checkout invoices
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
                Gross Profit Margin
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: 'success.main' }}>
                {kpis && kpis.grossProfitMargin.toFixed(1)}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Net Profit: {kpis && formatCurrency(kpis.totalSalesValue - kpis.totalCostOfGoods)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
                Outstanding Financing Assets
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: 'secondary.main' }}>
                {kpis && formatCurrency(kpis.totalOutstandingFinancing)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Receivables from active credit plans
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Chart Layout */}
      <Grid container spacing={3}>
        {/* Sales Trend Chart */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
              Sales Volume Trend
            </Typography>
            <Box sx={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value) => [`Rs. ${Number(value).toLocaleString()}`, 'Revenue']} />
                  <Area type="monotone" dataKey="revenue" stroke="#4f46e5" fillOpacity={1} fill="url(#revenueGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        {/* Category Performance */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Category Breakdown
            </Typography>
            {categorySales.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">No category data recorded</Typography>
              </Box>
            ) : (
              <TableContainer sx={{ maxHeight: 320 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Qty Sold</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total (Rs.)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {categorySales.map((cat, idx) => (
                      <TableRow key={idx}>
                        <TableCell sx={{ fontWeight: 600 }}>{cat.category_name || 'Uncategorized'}</TableCell>
                        <TableCell align="right">{cat.total_sold}</TableCell>
                        <TableCell align="right">{formatCurrency(cat.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Reports;
