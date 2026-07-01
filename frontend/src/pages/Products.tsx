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
  Chip,
  Avatar,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PhotoCamera,
  AddBox as ReceiveIcon,
  IndeterminateCheckBox as DamageIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';

interface Product {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  brand: string;
  model_number: string;
  description: string;
  purchase_cost: number;
  selling_price: number;
  stock_quantity: number;
  reorder_level: number;
  warranty_months: number;
  image_url: string | null;
}

interface Category {
  id: string;
  name: string;
}

export const Products: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Table & search states
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [rowCount, setRowCount] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');

  // Main dialog states (Create / Edit Product)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [description, setDescription] = useState('');
  const [purchaseCost, setPurchaseCost] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [stockQuantity, setStockQuantity] = useState(0);
  const [reorderLevel, setReorderLevel] = useState(5);
  const [warrantyMonths, setWarrantyMonths] = useState(12);

  // Image Upload State
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  // Stock adjustments (receive / damaged) states
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockDialogMode, setStockDialogMode] = useState<'receive' | 'damaged'>('receive');
  const [stockQuantityInput, setStockQuantityInput] = useState(1);
  const [stockReasonInput, setStockReasonInput] = useState('');

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/products', {
        params: {
          page: page + 1,
          limit: pageSize,
          search: search || undefined,
          categoryId: categoryFilter || undefined,
          stockStatus: stockFilter || undefined,
        },
      });
      setProducts(res.data.data || []);
      setRowCount(res.data.pagination?.total || 0);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch products catalog.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await apiClient.get('/categories?limit=100');
      setCategories(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [page, pageSize, search, categoryFilter, stockFilter]);

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleOpenCreate = () => {
    setDialogMode('create');
    setSelectedProduct(null);
    setName('');
    setCategoryId('');
    setBrand('');
    setModelNumber('');
    setDescription('');
    setPurchaseCost(0);
    setSellingPrice(0);
    setStockQuantity(0);
    setReorderLevel(5);
    setWarrantyMonths(12);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setDialogMode('edit');
    setSelectedProduct(p);
    setName(p.name);
    setCategoryId(p.category_id || '');
    setBrand(p.brand || '');
    setModelNumber(p.model_number || '');
    setDescription(p.description || '');
    setPurchaseCost(p.purchase_cost);
    setSellingPrice(p.selling_price);
    setStockQuantity(p.stock_quantity);
    setReorderLevel(p.reorder_level);
    setWarrantyMonths(p.warranty_months);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!name.trim()) {
      setFormError('Product name is required');
      return;
    }

    setFormLoading(true);
    setFormError(null);
    const payload = {
      name,
      categoryId: categoryId || null,
      brand: brand || null,
      modelNumber: modelNumber || null,
      description: description || null,
      purchaseCost: Number(purchaseCost),
      sellingPrice: Number(sellingPrice),
      stockQuantity: Number(stockQuantity),
      reorderLevel: Number(reorderLevel),
      warrantyMonths: Number(warrantyMonths),
    };

    try {
      if (dialogMode === 'create') {
        await apiClient.post('/products', payload);
      } else {
        await apiClient.put(`/products/${selectedProduct?.id}`, payload);
      }
      setDialogOpen(false);
      fetchProducts();
    } catch (err: any) {
      console.error(err);
      setFormError(err.response?.data?.error || 'Failed to save product');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteProduct = async (id: string, productName: string) => {
    if (window.confirm(`Are you sure you want to delete product "${productName}"?`)) {
      try {
        await apiClient.delete(`/products/${id}`);
        fetchProducts();
      } catch (err: any) {
        console.error(err);
        alert(err.response?.data?.error || 'Failed to delete product');
      }
    }
  };

  // Image Upload Handlers
  const handleOpenImageUpload = (p: Product) => {
    setSelectedProduct(p);
    setImageFile(null);
    setImageDialogOpen(true);
  };

  const handleUploadImage = async () => {
    if (!imageFile || !selectedProduct) return;
    setImageUploading(true);
    const formData = new FormData();
    formData.append('image', imageFile);

    try {
      await apiClient.post(`/products/${selectedProduct.id}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImageDialogOpen(false);
      fetchProducts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to upload image');
    } finally {
      setImageUploading(false);
    }
  };

  // Stock Movement handlers (Receive / Damaged)
  const handleOpenStockDialog = (p: Product, mode: 'receive' | 'damaged') => {
    setSelectedProduct(p);
    setStockDialogMode(mode);
    setStockQuantityInput(1);
    setStockReasonInput(mode === 'receive' ? 'Restock shipment received' : 'Damaged product recorded');
    setStockDialogOpen(true);
  };

  const handleSaveStockMovement = async () => {
    if (!selectedProduct) return;
    try {
      const endpoint = stockDialogMode === 'receive' ? '/inventory/receive' : '/inventory/damaged';
      await apiClient.post(endpoint, {
        productId: selectedProduct.id,
        quantity: stockQuantityInput,
        reason: stockReasonInput,
      });
      setStockDialogOpen(false);
      fetchProducts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update stock');
    }
  };

  const formatCurrency = (val: number) => {
    return `Rs. ${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const columns: GridColDef[] = [
    {
      field: 'image_url',
      headerName: 'Image',
      width: 80,
      sortable: false,
      renderCell: (params) => {
        const url = params.value ? `http://localhost:4000${params.value}` : '';
        return (
          <Avatar
            variant="rounded"
            src={url}
            sx={{ width: 40, height: 40, border: '1px solid #e2e8f0', mt: 0.5 }}
          />
        );
      },
    },
    { field: 'name', headerName: 'Product Name', flex: 1.5, minWidth: 200, renderCell: (params) => (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{params.value}</Typography>
        <Typography variant="caption" color="text.secondary">{params.row.brand} | {params.row.model_number}</Typography>
      </Box>
    )},
    { field: 'category_name', headerName: 'Category', flex: 1, minWidth: 120 },
    { field: 'selling_price', headerName: 'Selling Price', width: 140, type: 'number', renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(params.value)}</Typography>
    )},
    {
      field: 'stock_quantity',
      headerName: 'Stock',
      width: 120,
      type: 'number',
      renderCell: (params) => {
        const p = params.row as Product;
        const isLow = p.stock_quantity <= p.reorder_level;
        const isOut = p.stock_quantity === 0;

        return (
          <Chip
            label={isOut ? "OUT OF STOCK" : isLow ? `LOW: ${p.stock_quantity}` : `${p.stock_quantity} in stock`}
            color={isOut ? "error" : isLow ? "warning" : "success"}
            size="small"
            variant="outlined"
          />
        );
      },
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 220,
      sortable: false,
      renderCell: (params) => {
        const p = params.row as Product;
        return (
          <Box>
            {/* Stock Actions */}
            <Tooltip title="Receive Stock">
              <IconButton onClick={() => handleOpenStockDialog(p, 'receive')} size="small" color="primary">
                <ReceiveIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Record Damaged">
              <IconButton onClick={() => handleOpenStockDialog(p, 'damaged')} size="small" color="error" disabled={p.stock_quantity === 0}>
                <DamageIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            
            {/* Edit / Upload image (Admin Only) */}
            <Tooltip title={isAdmin ? "Edit Details" : "Admin Only"}>
              <span>
                <IconButton onClick={() => handleOpenEdit(p)} disabled={!isAdmin} size="small">
                  <EditIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={isAdmin ? "Upload Photo" : "Admin Only"}>
              <span>
                <IconButton onClick={() => handleOpenImageUpload(p)} disabled={!isAdmin} size="small">
                  <PhotoCamera fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={isAdmin ? "Delete Product" : "Admin Only"}>
              <span>
                <IconButton onClick={() => handleDeleteProduct(p.id, p.name)} disabled={!isAdmin} color="error" size="small">
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
            Products Catalog
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Browse and adjust product descriptions, stock levels, and imaging
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
            Add Product
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        {/* Filters */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Search Name, Brand, Model"
              variant="outlined"
              size="small"
              fullWidth
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              select
              label="Category Filter"
              variant="outlined"
              size="small"
              fullWidth
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <MenuItem value="">All Categories</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              select
              label="Stock Status"
              variant="outlined"
              size="small"
              fullWidth
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
            >
              <MenuItem value="">All Stock Levels</MenuItem>
              <MenuItem value="low">Low Stock (Reorder)</MenuItem>
              <MenuItem value="out">Out of Stock</MenuItem>
              <MenuItem value="in">In Stock (Healthy)</MenuItem>
            </TextField>
          </Grid>
        </Grid>

        <Box sx={{ height: 500, width: '100%' }}>
          <DataGrid
            rows={products}
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
            rowHeight={52}
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
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>
          {dialogMode === 'create' ? 'Add New Product' : 'Edit Product Details'}
        </DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Product Name"
                fullWidth
                variant="outlined"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                label="Category"
                fullWidth
                variant="outlined"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <MenuItem value="">Select Category</MenuItem>
                {categories.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Brand"
                fullWidth
                variant="outlined"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Model Number"
                fullWidth
                variant="outlined"
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Warranty Duration (Months)"
                type="number"
                fullWidth
                variant="outlined"
                value={warrantyMonths}
                onChange={(e) => setWarrantyMonths(Number(e.target.value))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                fullWidth
                multiline
                rows={3}
                variant="outlined"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Purchase Cost (Rs.)"
                type="number"
                fullWidth
                variant="outlined"
                value={purchaseCost}
                onChange={(e) => setPurchaseCost(Number(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Selling Price (Rs.)"
                type="number"
                fullWidth
                variant="outlined"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Initial Stock Quantity"
                type="number"
                fullWidth
                variant="outlined"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(Number(e.target.value))}
                disabled={dialogMode === 'edit'} // Force worker adjustments in edit mode
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Reorder Alert Threshold"
                type="number"
                fullWidth
                variant="outlined"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(Number(e.target.value))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveProduct} variant="contained" color="primary" disabled={formLoading}>
            {formLoading ? 'Saving...' : 'Save Product'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Image Upload Dialog */}
      <Dialog open={imageDialogOpen} onClose={() => setImageDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>Upload Product Image</DialogTitle>
        <DialogContent sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Selected product: <strong>{selectedProduct?.name}</strong>
          </Typography>
          <Button
            variant="outlined"
            component="label"
            startIcon={<PhotoCamera />}
            sx={{ mb: 2 }}
          >
            Choose Image File
            <input
              type="file"
              hidden
              accept="image/*"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  setImageFile(e.target.files[0]);
                }
              }}
            />
          </Button>
          {imageFile && (
            <Typography variant="body2" sx={{ mt: 1, color: 'success.main', fontWeight: 600 }}>
              File selected: {imageFile.name}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImageDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleUploadImage}
            variant="contained"
            color="primary"
            disabled={!imageFile || imageUploading}
          >
            {imageUploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Stock Adjustment Dialog */}
      <Dialog open={stockDialogOpen} onClose={() => setStockDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>
          {stockDialogMode === 'receive' ? 'Receive Shipments (Restock)' : 'Record Damaged Stock'}
        </DialogTitle>
        <DialogContent sx={{ py: 2 }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Product: <strong>{selectedProduct?.name}</strong>
          </Typography>
          <TextField
            label="Quantity"
            type="number"
            fullWidth
            variant="outlined"
            margin="normal"
            value={stockQuantityInput}
            onChange={(e) => setStockQuantityInput(Math.max(1, Number(e.target.value)))}
          />
          <TextField
            label="Reason / Remarks"
            fullWidth
            variant="outlined"
            margin="normal"
            multiline
            rows={2}
            value={stockReasonInput}
            onChange={(e) => setStockReasonInput(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStockDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveStockMovement} variant="contained" color="primary">
            Submit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Products;
