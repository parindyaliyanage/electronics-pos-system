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
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Info as InfoIcon,
  Storefront as SaleIcon,
  Payment as PaymentIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import apiClient from '../api/client';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

interface Purchase {
  id: string;
  total: string;
  payment_method: string;
  sale_date: string;
  employee_name: string;
}

interface Installment {
  id: string;
  principal: string;
  remaining_balance: string;
  status: string;
  next_due_date: string;
  monthly_payment: string;
  rate_duration: number;
}

export const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Table states
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [rowCount, setRowCount] = useState(0);
  const [search, setSearch] = useState('');

  // Edit / Create Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Detail Dialog states (purchases & installments)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/customers', {
        params: {
          page: page + 1,
          limit: pageSize,
          search: search || undefined,
        },
      });
      setCustomers(res.data.data || []);
      setRowCount(res.data.pagination?.total || 0);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch customers registry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [page, pageSize, search]);

  const handleOpenCreate = () => {
    setDialogMode('create');
    setSelectedCustomer(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setFormError(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setDialogMode('edit');
    setSelectedCustomer(c);
    setName(c.name);
    setPhone(c.phone || '');
    setEmail(c.email || '');
    setAddress(c.address || '');
    setFormError(null);
    setDialogOpen(true);
  };

  const handleOpenDetails = async (c: Customer) => {
    setSelectedCustomer(c);
    setDetailLoading(true);
    setDetailDialogOpen(true);
    try {
      const [purchasesRes, installmentsRes] = await Promise.all([
        apiClient.get(`/customers/${c.id}/purchases`),
        apiClient.get(`/customers/${c.id}/installments`),
      ]);
      setPurchases(purchasesRes.data || []);
      setInstallments(installmentsRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSaveCustomer = async () => {
    if (!name.trim()) {
      setFormError('Customer name is required');
      return;
    }

    setFormLoading(true);
    setFormError(null);
    const payload = { name, phone, email, address };

    try {
      if (dialogMode === 'create') {
        await apiClient.post('/customers', payload);
      } else {
        await apiClient.put(`/customers/${selectedCustomer?.id}`, payload);
      }
      setDialogOpen(false);
      fetchCustomers();
    } catch (err: any) {
      console.error(err);
      setFormError(err.response?.data?.error || 'Failed to save customer details');
    } finally {
      setFormLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return `Rs. ${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Customer Name', flex: 1.2, minWidth: 160, renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{params.value}</Typography>
    )},
    { field: 'phone', headerName: 'Phone Number', flex: 1, minWidth: 120 },
    { field: 'email', headerName: 'Email Address', flex: 1, minWidth: 160 },
    { field: 'address', headerName: 'Billing Address', flex: 1.5, minWidth: 200 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      sortable: false,
      renderCell: (params) => {
        const c = params.row as Customer;
        return (
          <Box>
            <Tooltip title="View Purchase / Installment History">
              <IconButton onClick={() => handleOpenDetails(c)} size="small" color="primary">
                <InfoIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Edit Customer">
              <IconButton onClick={() => handleOpenEdit(c)} size="small">
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        );
      },
    },
  ];

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Customers Registry
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Look up, add, and inspect customer installment payment plan records
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
          sx={{ borderRadius: 2 }}
        >
          Add Customer
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ mb: 2 }}>
          <TextField
            label="Search name, phone, email"
            variant="outlined"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: { xs: '100%', sm: 320 } }}
          />
        </Box>

        <Box sx={{ height: 480, width: '100%' }}>
          <DataGrid
            rows={customers}
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

      {/* Edit / Create Customer Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>
          {dialogMode === 'create' ? 'Register Customer' : 'Edit Customer Info'}
        </DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <TextField
            label="Full Name"
            fullWidth
            required
            variant="outlined"
            margin="normal"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={formLoading}
          />
          <TextField
            label="Phone Number"
            fullWidth
            variant="outlined"
            margin="normal"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={formLoading}
          />
          <TextField
            label="Email Address"
            fullWidth
            type="email"
            variant="outlined"
            margin="normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={formLoading}
          />
          <TextField
            label="Billing Address"
            fullWidth
            variant="outlined"
            margin="normal"
            multiline
            rows={2}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={formLoading}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={formLoading}>Cancel</Button>
          <Button onClick={handleSaveCustomer} variant="contained" color="primary" disabled={formLoading}>
            {formLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Customer Details Dialog (Purchases and Installments) */}
      <Dialog open={detailDialogOpen} onClose={() => setDetailDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>
          Customer Dashboard Preset: {selectedCustomer?.name}
        </DialogTitle>
        <DialogContent dividers>
          {detailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Grid container spacing={3}>
              {/* Purchase History */}
              <Grid item xs={12}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SaleIcon color="primary" /> Purchase History
                </Typography>
                {purchases.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No purchase records found.</Typography>
                ) : (
                  <List dense>
                    {purchases.map((p) => (
                      <ListItem key={p.id} sx={{ px: 0 }}>
                        <ListItemText
                          primary={`Invoice #${p.id.substring(0, 8).toUpperCase()} - ${formatCurrency(Number(p.total))}`}
                          secondary={`Method: ${p.payment_method.toUpperCase()} | Serviced by: ${p.employee_name} | Date: ${new Date(p.sale_date).toLocaleDateString()}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Grid>

              <Grid item xs={12}>
                <Divider />
              </Grid>

              {/* Installment Financing Plans */}
              <Grid item xs={12}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PaymentIcon color="secondary" /> Installment Plans
                </Typography>
                {installments.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No active financing plans.</Typography>
                ) : (
                  <List dense>
                    {installments.map((plan) => (
                      <ListItem key={plan.id} sx={{ px: 0 }}>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                              <span>Plan for {formatCurrency(Number(plan.principal))}</span>
                              <Chip
                                label={plan.status.toUpperCase()}
                                color={plan.status === 'completed' ? 'success' : plan.status === 'overdue' ? 'error' : 'warning'}
                                size="small"
                                variant="outlined"
                              />
                            </Box>
                          }
                          secondary={`Monthly: ${formatCurrency(Number(plan.monthly_payment))} | Remaining: ${formatCurrency(Number(plan.remaining_balance))} | Next Due Date: ${new Date(plan.next_due_date).toLocaleDateString()}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialogOpen(false)} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Customers;
