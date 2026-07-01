import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Paper,
  IconButton,
  Tooltip,
  Alert,
  MenuItem,
} from '@mui/material';
import {
  Download as DownloadIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import apiClient from '../api/client';

interface Payment {
  id: string;
  sale_id: string;
  amount: string;
  method: string;
  paid_at: string;
  sale_total: string;
  customer_name: string | null;
}

export const Payments: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination/search states
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [rowCount, setRowCount] = useState(0);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');

  const fetchPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/payments', {
        params: {
          page: page + 1,
          limit: pageSize,
          search: search || undefined,
          method: methodFilter || undefined,
        },
      });
      setPayments(res.data.data || []);
      setRowCount(res.data.pagination?.total || 0);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch payments ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [page, pageSize, search, methodFilter]);

  const downloadReceipt = async (paymentId: string) => {
    try {
      const response = await apiClient.get(`/pdf/receipt/sale/${paymentId}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `receipt-${paymentId.substring(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      console.error(err);
      alert('Failed to download receipt');
    }
  };

  const formatCurrency = (val: number) => {
    return `Rs. ${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'Payment Transaction ID', width: 180, renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{params.value.substring(0, 8).toUpperCase()}</Typography>
    )},
    { field: 'customer_name', headerName: 'Customer Name', flex: 1, minWidth: 150, renderCell: (params) => (
      <span>{params.value || 'Walk-in Customer'}</span>
    )},
    { field: 'amount', headerName: 'Amount Paid', width: 150, type: 'number', renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
        {formatCurrency(Number(params.value))}
      </Typography>
    )},
    { field: 'method', headerName: 'Payment Method', width: 150, renderCell: (params) => (
      <span>{params.value.toUpperCase()}</span>
    )},
    { field: 'paid_at', headerName: 'Date & Time Received', width: 200, renderCell: (params) => (
      <span>{new Date(params.value).toLocaleString()}</span>
    )},
    {
      field: 'actions',
      headerName: 'Receipt',
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <Tooltip title="Download Thermal Receipt PDF">
          <IconButton onClick={() => downloadReceipt(params.row.id)} size="small" color="primary">
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Payments Ledger
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Track in-store transactional payments received
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Search Customer Name or Invoice"
            variant="outlined"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: { xs: '100%', sm: 300 } }}
          />
          <TextField
            select
            label="Payment Method"
            variant="outlined"
            size="small"
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            sx={{ width: { xs: '100%', sm: 200 } }}
          >
            <MenuItem value="">All Methods</MenuItem>
            <MenuItem value="cash">Cash</MenuItem>
            <MenuItem value="card">Card</MenuItem>
            <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
            <MenuItem value="online">Online</MenuItem>
          </TextField>
        </Box>

        <Box sx={{ height: 480, width: '100%' }}>
          <DataGrid
            rows={payments}
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
    </Box>
  );
};

export default Payments;
