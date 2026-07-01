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
  MenuItem,
  Chip,
  Grid,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';

interface InterestRate {
  id: string;
  duration_months: number;
  rate: string;
  is_active: boolean;
  created_at: string;
}

export const InterestRates: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [rates, setRates] = useState<InterestRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [selectedRate, setSelectedRate] = useState<InterestRate | null>(null);
  
  // Form fields
  const [durationMonths, setDurationMonths] = useState<number>(12);
  const [ratePercent, setRatePercent] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const fetchRates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/interest-rates');
      setRates(res.data || []);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch interest rates configurations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, []);

  const handleOpenCreate = () => {
    setDialogMode('create');
    setSelectedRate(null);
    setDurationMonths(12);
    setRatePercent(0);
    setIsActive(true);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (item: InterestRate) => {
    setDialogMode('edit');
    setSelectedRate(item);
    setDurationMonths(item.duration_months);
    setRatePercent(Number(item.rate));
    setIsActive(item.is_active);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSaveRate = async () => {
    if (durationMonths <= 0) {
      setFormError('Duration must be greater than zero months.');
      return;
    }
    if (ratePercent < 0) {
      setFormError('Interest rate percentage cannot be negative.');
      return;
    }

    setFormLoading(true);
    setFormError(null);
    const payload = {
      durationMonths: Number(durationMonths),
      rate: Number(ratePercent),
      isActive,
    };

    try {
      if (dialogMode === 'create') {
        await apiClient.post('/interest-rates', payload);
      } else {
        await apiClient.put(`/interest-rates/${selectedRate?.id}`, payload);
      }
      setDialogOpen(false);
      fetchRates();
    } catch (err: any) {
      console.error(err);
      setFormError(err.response?.data?.error || 'Failed to save interest rate configuration. (Note: Only one active rate is allowed per duration month term).');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteRate = async (rateId: string, duration: number) => {
    if (window.confirm(`Are you sure you want to delete the interest rate rule for ${duration} months?`)) {
      try {
        await apiClient.delete(`/interest-rates/${rateId}`);
        fetchRates();
      } catch (err: any) {
        console.error(err);
        alert(err.response?.data?.error || 'Failed to delete interest rate config.');
      }
    }
  };

  if (!isAdmin) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Access Denied. You do not have permissions to manage store interest rates parameters.</Alert>
      </Box>
    );
  }

  const columns: GridColDef[] = [
    { field: 'duration_months', headerName: 'Installment Term Length', flex: 1, minWidth: 150, renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{params.value} Months</Typography>
    )},
    { field: 'rate', headerName: 'Flat Interest Rate', width: 180, renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>{params.value}%</Typography>
    )},
    { field: 'is_active', headerName: 'Status', width: 140, renderCell: (params) => (
      <Chip label={params.value ? 'ACTIVE' : 'INACTIVE'} color={params.value ? 'success' : 'default'} size="small" />
    )},
    { field: 'created_at', headerName: 'Configured Date', width: 200, renderCell: (params) => (
      <span>{new Date(params.value).toLocaleDateString()}</span>
    )},
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      renderCell: (params) => {
        const item = params.row as InterestRate;
        return (
          <Box>
            <Tooltip title="Edit Rate Rule">
              <IconButton onClick={() => handleOpenEdit(item)} size="small">
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete Rate Rule">
              <IconButton onClick={() => handleDeleteRate(item.id, item.duration_months)} color="error" size="small">
                <DeleteIcon fontSize="small" />
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
            Installment Interest Rates
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure active installment periods and flat interest rate metrics
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
          sx={{ borderRadius: 2 }}
        >
          Add Rate Rule
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
        The system only allows <strong>one active interest rate rule</strong> per term duration (e.g. one rule for 12 months). Attempting to activate another active rule for the same duration will fail to ensure installment calculations remain deterministic.
      </Alert>

      <Paper sx={{ p: 2 }}>
        <Box sx={{ height: 400, width: '100%' }}>
          <DataGrid
            rows={rates}
            columns={columns}
            loading={loading}
            disableRowSelectionOnClick
            hideFooterPagination
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>
          {dialogMode === 'create' ? 'Add Interest Rate Rule' : 'Edit Interest Rate Details'}
        </DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Duration (Months)"
                type="number"
                fullWidth
                required
                variant="outlined"
                value={durationMonths}
                onChange={(e) => setDurationMonths(Math.max(1, Number(e.target.value)))}
                disabled={dialogMode === 'edit' || formLoading}
                helperText="Number of months for this financing term (e.g. 12)"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Flat Interest Rate (%)"
                type="number"
                fullWidth
                required
                variant="outlined"
                value={ratePercent}
                onChange={(e) => setRatePercent(Number(e.target.value))}
                disabled={formLoading}
                helperText="Flat percentage added to the total (e.g. 12.5)"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                select
                label="Rule Status"
                fullWidth
                variant="outlined"
                value={isActive}
                onChange={(e: any) => setIsActive(e.target.value === 'true' || e.target.value === true)}
                disabled={formLoading}
              >
                <MenuItem value="true">Active (Available at Checkout)</MenuItem>
                <MenuItem value="false">Inactive</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={formLoading}>Cancel</Button>
          <Button onClick={handleSaveRate} variant="contained" color="primary" disabled={formLoading}>
            {formLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InterestRates;
