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
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';

interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'worker';
  is_active: boolean;
  created_at: string;
}

export const Users: React.FC = () => {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Table pagination/search states
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [rowCount, setRowCount] = useState(0);
  const [search, setSearch] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [selectedUser, setSelectedUser] = useState<StaffUser | null>(null);
  
  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'worker'>('worker');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/users', {
        params: {
          page: page + 1,
          limit: pageSize,
          search: search || undefined,
        },
      });
      setUsers(res.data.data || []);
      setRowCount(res.data.pagination?.total || 0);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to fetch staff members list. Ensure you are logged in as administrator.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [page, pageSize, search, isAdmin]);

  const handleOpenCreate = () => {
    setDialogMode('create');
    setSelectedUser(null);
    setFullName('');
    setEmail('');
    setPassword('');
    setRole('worker');
    setIsActive(true);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (user: StaffUser) => {
    setDialogMode('edit');
    setSelectedUser(user);
    setFullName(user.full_name);
    setEmail(user.email);
    setPassword(''); // leave blank unless changing
    setRole(user.role);
    setIsActive(user.is_active);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSaveUser = async () => {
    if (!fullName.trim() || !email.trim()) {
      setFormError('Full name and email are required');
      return;
    }
    if (dialogMode === 'create' && !password) {
      setFormError('Password is required for new accounts');
      return;
    }

    setFormLoading(true);
    setFormError(null);
    const payload = {
      fullName,
      email,
      password: password || undefined,
      role,
      isActive,
    };

    try {
      if (dialogMode === 'create') {
        await apiClient.post('/users', payload);
      } else {
        await apiClient.put(`/users/${selectedUser?.id}`, payload);
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (err: any) {
      console.error(err);
      setFormError(err.response?.data?.error || 'Failed to save staff member details');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteUser = async (user: StaffUser) => {
    if (user.id === currentUser?.id) {
      alert('You cannot delete your own account!');
      return;
    }

    if (window.confirm(`Are you sure you want to delete staff account for "${user.full_name}"?`)) {
      try {
        await apiClient.delete(`/users/${user.id}`);
        fetchUsers();
      } catch (err: any) {
        console.error(err);
        alert(err.response?.data?.error || 'Failed to delete user account');
      }
    }
  };

  if (!isAdmin) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Access Denied. You do not have permissions to manage staff accounts.</Alert>
      </Box>
    );
  }

  const columns: GridColDef[] = [
    { field: 'full_name', headerName: 'Full Name', flex: 1.2, minWidth: 160, renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{params.value}</Typography>
    )},
    { field: 'email', headerName: 'Email Address', flex: 1.2, minWidth: 180 },
    { field: 'role', headerName: 'User Role', width: 120, renderCell: (params) => {
      const isRoleAdmin = params.value === 'admin';
      return <Chip label={params.value.toUpperCase()} color={isRoleAdmin ? 'secondary' : 'default'} size="small" variant="outlined" />;
    }},
    { field: 'is_active', headerName: 'Account Status', width: 120, renderCell: (params) => {
      const active = params.value;
      return <Chip label={active ? 'ACTIVE' : 'SUSPENDED'} color={active ? 'success' : 'error'} size="small" />;
    }},
    { field: 'created_at', headerName: 'Created Date', width: 180, renderCell: (params) => (
      <span>{new Date(params.value).toLocaleDateString()}</span>
    )},
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      renderCell: (params) => {
        const u = params.row as StaffUser;
        return (
          <Box>
            <Tooltip title="Edit Staff Details">
              <IconButton onClick={() => handleOpenEdit(u)} size="small">
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete Account">
              <IconButton onClick={() => handleDeleteUser(u)} color="error" size="small" disabled={u.id === currentUser?.id}>
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
            Staff User Directory
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage administrative credentials and store cashier roles
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
          sx={{ borderRadius: 2 }}
        >
          Add Staff Member
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ mb: 2 }}>
          <TextField
            label="Search name or email"
            variant="outlined"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: { xs: '100%', sm: 300 } }}
          />
        </Box>

        <Box sx={{ height: 480, width: '100%' }}>
          <DataGrid
            rows={users}
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>
          {dialogMode === 'create' ? 'Add Staff Member' : 'Edit Staff Details'}
        </DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <TextField
            label="Full Name"
            fullWidth
            required
            variant="outlined"
            margin="normal"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={formLoading}
          />
          <TextField
            label="Email Address"
            fullWidth
            required
            type="email"
            variant="outlined"
            margin="normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={formLoading}
          />
          <TextField
            label={dialogMode === 'create' ? 'Password' : 'Password (Leave blank to keep current)'}
            fullWidth
            required={dialogMode === 'create'}
            type="password"
            variant="outlined"
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={formLoading}
          />
          <TextField
            select
            label="Staff Role"
            fullWidth
            variant="outlined"
            margin="normal"
            value={role}
            onChange={(e: any) => setRole(e.target.value)}
            disabled={formLoading}
          >
            <MenuItem value="worker">Store Worker / Cashier</MenuItem>
            <MenuItem value="admin">Administrator / Manager</MenuItem>
          </TextField>
          <TextField
            select
            label="Account Status"
            fullWidth
            variant="outlined"
            margin="normal"
            value={isActive}
            onChange={(e: any) => setIsActive(e.target.value === 'true' || e.target.value === true)}
            disabled={formLoading}
          >
            <MenuItem value="true">Active</MenuItem>
            <MenuItem value="false">Suspended</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={formLoading}>Cancel</Button>
          <Button onClick={handleSaveUser} variant="contained" color="primary" disabled={formLoading}>
            {formLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Users;
