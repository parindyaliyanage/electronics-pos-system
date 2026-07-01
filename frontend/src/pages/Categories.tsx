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
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';

interface Category {
  id: string;
  name: string;
  product_count: number;
}

export const Categories: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Table state
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [rowCount, setRowCount] = useState(0);
  const [search, setSearch] = useState('');
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);

  const fetchCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/categories', {
        params: {
          page: page + 1,
          limit: pageSize,
          search: search || undefined,
        },
      });
      setCategories(res.data.data || []);
      setRowCount(res.data.pagination?.total || 0);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch categories list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, [page, pageSize, search]);

  const handleOpenCreate = () => {
    setDialogMode('create');
    setSelectedCategory(null);
    setCategoryName('');
    setDialogError(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    setDialogMode('edit');
    setSelectedCategory(category);
    setCategoryName(category.name);
    setDialogError(null);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      setDialogError('Category name is required');
      return;
    }

    setDialogLoading(true);
    setDialogError(null);
    try {
      if (dialogMode === 'create') {
        await apiClient.post('/categories', { name: categoryName });
      } else {
        await apiClient.put(`/categories/${selectedCategory?.id}`, { name: categoryName });
      }
      handleCloseDialog();
      fetchCategories();
    } catch (err: any) {
      console.error(err);
      setDialogError(err.response?.data?.error || 'Failed to save category');
    } finally {
      setDialogLoading(false);
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    if (category.product_count > 0) {
      alert(`Cannot delete category "${category.name}" because it contains ${category.product_count} products. Move the products to another category first.`);
      return;
    }

    if (window.confirm(`Are you sure you want to delete category "${category.name}"?`)) {
      try {
        await apiClient.delete(`/categories/${category.id}`);
        fetchCategories();
      } catch (err: any) {
        console.error(err);
        alert(err.response?.data?.error || 'Failed to delete category');
      }
    }
  };

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Category Name', flex: 1, minWidth: 200, renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{params.value}</Typography>
    )},
    { field: 'product_count', headerName: 'Number of Products', width: 200, type: 'number' },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      sortable: false,
      renderCell: (params) => {
        const category = params.row as Category;
        return (
          <Box>
            <Tooltip title={isAdmin ? "Edit Category" : "Admin Only"}>
              <span>
                <IconButton onClick={() => handleOpenEdit(category)} disabled={!isAdmin} size="small">
                  <EditIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={isAdmin ? "Delete Category" : "Admin Only"}>
              <span>
                <IconButton onClick={() => handleDeleteCategory(category)} disabled={!isAdmin || category.product_count > 0} color="error" size="small">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
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
            Categories
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage product categories and catalogs
          </Typography>
        </Box>
        {isAdmin && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{ borderRadius: 2 }}
          >
            Create Category
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ mb: 2 }}>
          <TextField
            label="Search Categories"
            variant="outlined"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: { xs: '100%', sm: 300 } }}
          />
        </Box>

        <Box sx={{ height: 450, width: '100%' }}>
          <DataGrid
            rows={categories}
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
      <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>
          {dialogMode === 'create' ? 'Create New Category' : 'Edit Category'}
        </DialogTitle>
        <DialogContent>
          {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
          <TextField
            autoFocus
            margin="dense"
            label="Category Name"
            fullWidth
            variant="outlined"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            disabled={dialogLoading}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={dialogLoading}>
            Cancel
          </Button>
          <Button onClick={handleSaveCategory} variant="contained" color="primary" disabled={dialogLoading}>
            {dialogLoading ? <CircularProgress size={24} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Categories;
