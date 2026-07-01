import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Paper,
  Grid,
  MenuItem,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material';
import {
  Payment as PayIcon,
  Info as InfoIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import apiClient from '../api/client';

interface InstallmentPlan {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  principal: string;
  interest_rate: string;
  duration_months: number;
  monthly_payment: string;
  remaining_balance: string;
  next_due_date: string;
  status: 'active' | 'completed' | 'overdue' | 'defaulted';
  total_interest: number;
  total_repayment: number;
}

interface InstallmentPayment {
  id: string;
  amount: string;
  paid_at: string;
}

export const Installments: React.FC = () => {
  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Table pagination/filtering
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [rowCount, setRowCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Info details dialog states
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<InstallmentPlan | null>(null);
  const [planPayments, setPlanPayments] = useState<InstallmentPayment[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Pay Dialog states
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payError, setPayError] = useState<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/installments', {
        params: {
          page: page + 1,
          limit: pageSize,
          search: search || undefined,
          status: statusFilter || undefined,
        },
      });
      setPlans(res.data.data || []);
      setRowCount(res.data.pagination?.total || 0);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch installment financing accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [page, pageSize, search, statusFilter]);

  const handleOpenDetails = async (plan: InstallmentPlan) => {
    setSelectedPlan(plan);
    setDetailsLoading(true);
    setDetailsOpen(true);
    try {
      const res = await apiClient.get(`/installments/${plan.id}`);
      setPlanPayments(res.data.payments || []);
    } catch (err) {
      console.error('Failed to load plan payments', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleOpenPay = (plan: InstallmentPlan) => {
    setSelectedPlan(plan);
    // Suggest the exact monthly payment or remaining balance (whichever is lower)
    const monthly = Number(plan.monthly_payment);
    const remaining = Number(plan.remaining_balance);
    setPayAmount(Math.round(Math.min(monthly, remaining) * 100) / 100);
    setPayError(null);
    setPayOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedPlan) return;
    if (payAmount <= 0) {
      setPayError('Payment amount must be greater than zero.');
      return;
    }
    const remaining = Number(selectedPlan.remaining_balance);
    if (payAmount > remaining) {
      setPayError(`Payment cannot exceed the outstanding balance of ${formatCurrency(remaining)}`);
      return;
    }

    setPayLoading(true);
    setPayError(null);
    try {
      await apiClient.post(`/installments/${selectedPlan.id}/pay`, { amount: payAmount });
      setPayOpen(false);
      fetchPlans();
      // If details dialog is open under it, refresh details
      if (detailsOpen) {
        handleOpenDetails(selectedPlan);
      }
    } catch (err: any) {
      console.error(err);
      setPayError(err.response?.data?.error || 'Failed to submit payment transaction.');
    } finally {
      setPayLoading(false);
    }
  };

  const downloadReceipt = async (paymentId: string) => {
    try {
      const response = await apiClient.get(`/pdf/receipt/installment/${paymentId}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `installment-receipt-${paymentId.substring(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      console.error(err);
      alert('Failed to download receipt');
    }
  };

  const formatCurrency = (val: number) => {
    return `Rs. ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const columns: GridColDef[] = [
    { field: 'customer_name', headerName: 'Customer Name', flex: 1.2, minWidth: 150, renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{params.value}</Typography>
    )},
    { field: 'principal', headerName: 'Principal Amount', width: 140, type: 'number', renderCell: (params) => (
      <span>{formatCurrency(Number(params.value))}</span>
    )},
    { field: 'interest_rate', headerName: 'Interest Rate', width: 110, align: 'center', renderCell: (params) => (
      <span>{params.value}%</span>
    )},
    { field: 'duration_months', headerName: 'Term', width: 90, align: 'center', renderCell: (params) => (
      <span>{params.value} Months</span>
    )},
    { field: 'monthly_payment', headerName: 'Monthly Due', width: 130, type: 'number', renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(Number(params.value))}</Typography>
    )},
    { field: 'remaining_balance', headerName: 'Remaining Balance', width: 150, type: 'number', renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 700, color: Number(params.value) > 0 ? 'secondary.main' : 'text.disabled' }}>
        {formatCurrency(Number(params.value))}
      </Typography>
    )},
    { field: 'next_due_date', headerName: 'Due Date', width: 120, renderCell: (params) => (
      <span>{new Date(params.value).toLocaleDateString()}</span>
    )},
    { field: 'status', headerName: 'Status', width: 120, renderCell: (params) => {
      const status = params.value;
      const color = status === 'completed' ? 'success' : status === 'overdue' ? 'error' : 'warning';
      return <Chip label={status.toUpperCase()} color={color} size="small" variant="outlined" />;
    }},
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      renderCell: (params) => {
        const plan = params.row as InstallmentPlan;
        return (
          <Box>
            <Tooltip title="View History details">
              <IconButton onClick={() => handleOpenDetails(plan)} size="small" color="primary">
                <InfoIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {plan.status !== 'completed' && (
              <Tooltip title="Collect Payment">
                <IconButton onClick={() => handleOpenPay(plan)} size="small" color="success">
                  <PayIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        );
      },
    },
  ];

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Installment Plans
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Collect customer installment payments and review outstanding schedules
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Search Customer Name"
              variant="outlined"
              size="small"
              fullWidth
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              label="Plan Status"
              variant="outlined"
              size="small"
              fullWidth
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <MenuItem value="">All Plans</MenuItem>
              <MenuItem value="active">Active Plans</MenuItem>
              <MenuItem value="overdue">Overdue Plans</MenuItem>
              <MenuItem value="completed">Completed Plans</MenuItem>
              <MenuItem value="defaulted">Defaulted Plans</MenuItem>
            </TextField>
          </Grid>
        </Grid>

        <Box sx={{ height: 480, width: '100%' }}>
          <DataGrid
            rows={plans}
            columns={columns}
            paginationMode="server"
            rowCount={rowCount}
            paginationModel={{ page, pageSize }}
            onPaginationModelChange={(model) => {
              setPage(model.page);
              setPageSize(model.pageSize);
            }}
            loading={loading}
            pageSizeOptions={[5, 10, 20]}
            disableRowSelectionOnClick
            sx={{
              border: 'none',
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: 'rgba(248, 250, 252, 0.5)',
                borderBottom: '1px solid #e2e8f0',
              },
              '& .MuiDataGrid-cell': {
                borderBottom: '1px solid #f1f5f9',
              },
            }}
          />
        </Box>
      </Paper>

      {/* Plan Details & Payment History Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>
          Financing Plan Details
        </DialogTitle>
        <DialogContent dividers>
          {selectedPlan && (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">CUSTOMER PROFILE</Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>{selectedPlan.customer_name}</Typography>
                <Typography variant="caption" color="text.secondary">{selectedPlan.customer_phone}</Typography>
              </Grid>
              
              <Grid item xs={6} sm={4}>
                <Typography variant="caption" color="text.secondary">PRINCIPAL VALUE</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(Number(selectedPlan.principal))}</Typography>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption" color="text.secondary">FLAT INTEREST RATE</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedPlan.interest_rate}% ({formatCurrency(selectedPlan.total_interest)})</Typography>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption" color="text.secondary">TOTAL REPAYMENT</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>{formatCurrency(selectedPlan.total_repayment)}</Typography>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption" color="text.secondary">PLAN TERM</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedPlan.duration_months} Months</Typography>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption" color="text.secondary">MONTHLY PAYMENT</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'secondary.main' }}>{formatCurrency(Number(selectedPlan.monthly_payment))}</Typography>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption" color="text.secondary">OUTSTANDING BALANCE</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main' }}>{formatCurrency(Number(selectedPlan.remaining_balance))}</Typography>
              </Grid>
            </Grid>
          )}

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            Payment History Ledger
          </Typography>
          
          {detailsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress />
            </Box>
          ) : planPayments.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No payments recorded yet for this plan.
            </Typography>
          ) : (
            <List dense>
              {planPayments.map((pay) => (
                <ListItem
                  key={pay.id}
                  secondaryAction={
                    <Tooltip title="Download Thermal Receipt">
                      <IconButton onClick={() => downloadReceipt(pay.id)} edge="end" color="primary">
                        <DownloadIcon />
                      </IconButton>
                    </Tooltip>
                  }
                  sx={{ borderBottom: '1px solid #f1f5f9' }}
                >
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
                        +{formatCurrency(Number(pay.amount))}
                      </Typography>
                    }
                    secondary={`Transaction Date: ${new Date(pay.paid_at).toLocaleString()}`}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>Close</Button>
          {selectedPlan && selectedPlan.status !== 'completed' && (
            <Button variant="contained" color="success" startIcon={<PayIcon />} onClick={() => handleOpenPay(selectedPlan)}>
              Collect Payment
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Collect Payment Dialog */}
      <Dialog open={payOpen} onClose={() => setPayOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>Record Installment Payment</DialogTitle>
        <DialogContent>
          {payError && <Alert severity="error" sx={{ mb: 2 }}>{payError}</Alert>}
          <Typography variant="body2" sx={{ mb: 2 }}>
            Recording payment for: <strong>{selectedPlan?.customer_name}</strong>
            <br />
            Outstanding Balance: <strong>{selectedPlan && formatCurrency(Number(selectedPlan.remaining_balance))}</strong>
          </Typography>
          <TextField
            label="Payment Amount (Rs.)"
            type="number"
            fullWidth
            required
            variant="outlined"
            value={payAmount}
            onChange={(e) => setPayAmount(Math.max(0, Number(e.target.value)))}
            disabled={payLoading}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayOpen(false)} disabled={payLoading}>Cancel</Button>
          <Button onClick={handleRecordPayment} variant="contained" color="primary" disabled={payLoading}>
            {payLoading ? 'Recording...' : 'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Installments;
