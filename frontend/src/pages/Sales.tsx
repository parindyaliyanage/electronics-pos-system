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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Card,
  CardContent,
  Autocomplete,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  ReceiptLong as ReceiptIcon,
  Download as DownloadIcon,
  Storefront as StoreIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import apiClient from '../api/client';

interface Product {
  id: string;
  name: string;
  brand: string;
  selling_price: number;
  stock_quantity: number;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
}

interface InterestRate {
  id: string;
  duration_months: number;
  rate: number;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface Sale {
  id: string;
  customer_name: string | null;
  employee_name: string;
  total: string;
  payment_method: string;
  sale_date: string;
}

export const Sales: React.FC = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sales list states
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [rowCount, setRowCount] = useState(0);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Checkout states
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rates, setRates] = useState<InterestRate[]>([]);
  
  // Checkout Form fields
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'online' | 'installment'>('cash');
  const [selectedDuration, setSelectedDuration] = useState<number>(12);
  const [taxRate, setTaxRate] = useState<number>(0);
  
  // Product adding autocomplete state
  const [productInputValue, setProductInputValue] = useState('');
  const [selectedProductField, setSelectedProductField] = useState<Product | null>(null);

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Invoice view state
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const fetchSales = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/sales', {
        params: {
          page: page + 1,
          limit: pageSize,
          search: search || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      });
      setSales(res.data.data || []);
      setRowCount(res.data.pagination?.total || 0);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch sales log.');
    } finally {
      setLoading(false);
    }
  };

  const loadCheckoutConfig = async () => {
    try {
      const [custRes, prodRes, rateRes, settingsRes] = await Promise.all([
        apiClient.get('/customers?limit=100'),
        apiClient.get('/products?limit=200'),
        apiClient.get('/interest-rates'),
        apiClient.get('/settings'),
      ]);
      setCustomers(custRes.data.data || []);
      // Filter out-of-stock products
      setProducts((prodRes.data.data || []).filter((p: Product) => p.stock_quantity > 0));
      setRates(rateRes.data || []);
      setTaxRate(parseFloat(settingsRes.data.tax_rate) || 0);
    } catch (err) {
      console.error('Failed to load checkout settings', err);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [page, pageSize, search, dateFrom, dateTo]);

  const handleOpenCheckout = () => {
    loadCheckoutConfig();
    setSelectedCustomer(null);
    setCart([]);
    setDiscount(0);
    setPaymentMethod('cash');
    setSelectedDuration(12);
    setCheckoutError(null);
    setCheckoutOpen(true);
  };

  const handleAddProductToCart = (prod: Product | null) => {
    if (!prod) return;
    
    // Check if already in cart
    const existing = cart.find((item) => item.product.id === prod.id);
    if (existing) {
      if (existing.quantity >= prod.stock_quantity) {
        alert(`Cannot add more. Available stock for ${prod.name} is ${prod.stock_quantity}.`);
        return;
      }
      setCart(
        cart.map((item) =>
          item.product.id === prod.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
    } else {
      setCart([...cart, { product: prod, quantity: 1 }]);
    }
    
    setSelectedProductField(null);
  };

  const handleUpdateCartQuantity = (prodId: string, qty: number, stockMax: number) => {
    if (qty <= 0) return;
    if (qty > stockMax) {
      alert(`Cannot exceed available stock of ${stockMax} units.`);
      return;
    }
    setCart(
      cart.map((item) => (item.product.id === prodId ? { ...item, quantity: qty } : item))
    );
  };

  const handleRemoveFromCart = (prodId: string) => {
    setCart(cart.filter((item) => item.product.id !== prodId));
  };

  // Calculated pricing
  const subtotal = cart.reduce((sum, item) => sum + item.product.selling_price * item.quantity, 0);
  const tax = subtotal * (taxRate / 100);
  const total = Math.max(0, subtotal - discount + tax);

  // Interest computation (Flat interest)
  const activeRateObj = rates.find((r) => r.duration_months === selectedDuration);
  const interestRateVal = activeRateObj ? activeRateObj.rate : 0;
  const totalInterest = paymentMethod === 'installment' ? total * (interestRateVal / 100) : 0;
  const totalRepayment = total + totalInterest;
  const monthlyPayment = paymentMethod === 'installment' && selectedDuration > 0 ? totalRepayment / selectedDuration : 0;

  const handleCheckoutSubmit = async () => {
    if (cart.length === 0) {
      setCheckoutError('Cart is empty');
      return;
    }
    if (paymentMethod === 'installment' && !selectedCustomer) {
      setCheckoutError('A registered customer is required for installment plans.');
      return;
    }

    setCheckoutLoading(true);
    setCheckoutError(null);

    const payload = {
      customerId: selectedCustomer?.id || null,
      items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
      discount: Number(discount),
      paymentMethod,
      installmentDuration: paymentMethod === 'installment' ? selectedDuration : undefined,
    };

    try {
      const res = await apiClient.post('/sales', payload);
      setCompletedSaleId(res.data.id);
      setCheckoutOpen(false);
      setInvoiceOpen(true);
      fetchSales();
    } catch (err: any) {
      console.error(err);
      setCheckoutError(err.response?.data?.error || 'Failed to complete transaction.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const downloadPDF = async (saleId: string) => {
    try {
      const response = await apiClient.get(`/pdf/invoice/${saleId}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoice-${saleId.substring(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      console.error('PDF download error:', err);
      alert('Failed to download invoice PDF');
    }
  };

  const formatCurrency = (val: number) => {
    return `Rs. ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'Invoice ID', width: 140, renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{params.value.substring(0, 8).toUpperCase()}</Typography>
    )},
    { field: 'customer_name', headerName: 'Customer', flex: 1, minWidth: 150, renderCell: (params) => (
      <span>{params.value || 'Walk-in Customer'}</span>
    )},
    { field: 'payment_method', headerName: 'Payment Method', width: 150, renderCell: (params) => (
      <Chip label={params.value.toUpperCase()} size="small" color={params.value === 'installment' ? 'secondary' : 'default'} variant="outlined" />
    )},
    { field: 'total', headerName: 'Total Price', width: 150, type: 'number', renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(Number(params.value))}</Typography>
    )},
    { field: 'sale_date', headerName: 'Transaction Date', width: 180, renderCell: (params) => (
      <span>{new Date(params.value).toLocaleString()}</span>
    )},
    { field: 'employee_name', headerName: 'Cashier', width: 140 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <Tooltip title="Download Invoice">
          <IconButton onClick={() => downloadPDF(params.row.id)} size="small" color="primary">
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Sales Ledger
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Process checkout transactions and inspect customer invoices
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleOpenCheckout}
          sx={{ borderRadius: 2 }}
        >
          New Sales Order
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        {/* Filters */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Search Invoice ID or Customer Name"
              variant="outlined"
              size="small"
              fullWidth
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Date From"
              type="date"
              variant="outlined"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Date To"
              type="date"
              variant="outlined"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </Grid>
        </Grid>

        <Box sx={{ height: 480, width: '100%' }}>
          <DataGrid
            rows={sales}
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

      {/* Checkout Wizard Dialog */}
      <Dialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 700 }}>
          New Sales Checkout Transaction
        </DialogTitle>
        <DialogContent dividers>
          {checkoutError && <Alert severity="error" sx={{ mb: 2 }}>{checkoutError}</Alert>}
          
          <Grid container spacing={3}>
            {/* Left Column: Customer & Cart Selection */}
            <Grid item xs={12} md={7}>
              {/* Customer Selector */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Customer Profile
                </Typography>
                <Autocomplete
                  options={customers}
                  getOptionLabel={(option) => `${option.name} (${option.phone || 'No phone'})`}
                  value={selectedCustomer}
                  onChange={(_, val) => setSelectedCustomer(val)}
                  renderInput={(params) => (
                    <TextField {...params} label="Select Registered Customer (Optional except for Installments)" variant="outlined" size="small" />
                  )}
                />
              </Box>

              {/* Product Selector */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Scan / Select Products
                </Typography>
                <Autocomplete
                  options={products}
                  getOptionLabel={(option) => `${option.name} (${option.brand} - Rs. ${option.selling_price.toLocaleString()} | stock: ${option.stock_quantity})`}
                  value={selectedProductField}
                  onChange={(_, val) => handleAddProductToCart(val)}
                  inputValue={productInputValue}
                  onInputChange={(_, val) => setProductInputValue(val)}
                  renderInput={(params) => (
                    <TextField {...params} label="Search and Add Product" variant="outlined" size="small" />
                  )}
                />
              </Box>

              {/* Shopping Cart Table */}
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Shopping Cart Items
              </Typography>
              {cart.length === 0 ? (
                <Paper variant="outlined" sx={{ py: 3, textAlign: 'center', bgcolor: 'rgba(248, 250, 252, 0.5)' }}>
                  <Typography color="text.secondary">Cart is empty. Add products above.</Typography>
                </Paper>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Qty</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Price</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Total</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cart.map((item) => (
                        <TableRow key={item.product.id}>
                          <TableCell sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.product.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{item.product.brand}</Typography>
                          </TableCell>
                          <TableCell align="center">
                            <TextField
                              type="number"
                              size="small"
                              inputProps={{ min: 1, max: item.product.stock_quantity, style: { textAlign: 'center', width: 45 } }}
                              value={item.quantity}
                              onChange={(e) => handleUpdateCartQuantity(item.product.id, Number(e.target.value), item.product.stock_quantity)}
                              sx={{ width: 70 }}
                            />
                          </TableCell>
                          <TableCell align="right">{formatCurrency(item.product.selling_price)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(item.product.selling_price * item.quantity)}</TableCell>
                          <TableCell align="center">
                            <IconButton onClick={() => handleRemoveFromCart(item.product.id)} size="small" color="error">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Grid>

            {/* Right Column: Checkout Pricing & Payment Terms */}
            <Grid item xs={12} md={5}>
              <Card sx={{ bgcolor: 'rgba(79, 70, 229, 0.03)', height: '100%', border: '1px solid #e2e8f0' }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                    Billing & Checkout
                  </Typography>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(subtotal)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary">Discount (Rs.)</Typography>
                      <TextField
                        type="number"
                        size="small"
                        value={discount}
                        onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                        sx={{ width: 120 }}
                      />
                    </Box>
                    {taxRate > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Tax ({taxRate}%)</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(tax)}</Typography>
                      </Box>
                    )}
                    <Divider />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Principal (Total)</Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'primary.main' }}>
                        {formatCurrency(total)}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Payment Method Selection */}
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    Payment Terms
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    value={paymentMethod}
                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                    sx={{ mb: 3 }}
                  >
                    <MenuItem value="cash">Full Cash Payment</MenuItem>
                    <MenuItem value="card">Full Debit/Credit Card</MenuItem>
                    <MenuItem value="bank_transfer">Direct Bank Transfer</MenuItem>
                    <MenuItem value="online">Online Payment Portal</MenuItem>
                    <MenuItem value="installment">Installment Financing Plan</MenuItem>
                  </TextField>

                  {/* Installment Plan Calculator View */}
                  {paymentMethod === 'installment' && (
                    <Box sx={{ p: 2, bgcolor: '#ffffff', borderRadius: 2, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'secondary.main', display: 'block' }}>
                        FINANCING TERMS (FLAT INTEREST)
                      </Typography>
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary">Duration</Typography>
                        <TextField
                          select
                          size="small"
                          value={selectedDuration}
                          onChange={(e: any) => setSelectedDuration(Number(e.target.value))}
                          sx={{ width: 140 }}
                        >
                          {rates.map((r) => (
                            <MenuItem key={r.id} value={r.duration_months}>
                              {r.duration_months} Months ({r.rate}%)
                            </MenuItem>
                          ))}
                        </TextField>
                      </Box>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" color="text.secondary">Flat Interest Rate</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>{interestRateVal}%</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" color="text.secondary">Total Interest Charge</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>{formatCurrency(totalInterest)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" color="text.secondary">Total Repayment Amount</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>{formatCurrency(totalRepayment)}</Typography>
                      </Box>
                      
                      <Divider />
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>Monthly Payment</Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'secondary.main' }}>
                          {formatCurrency(monthlyPayment)}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCheckoutOpen(false)} disabled={checkoutLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleCheckoutSubmit}
            variant="contained"
            color="primary"
            disabled={cart.length === 0 || checkoutLoading}
            startIcon={checkoutLoading ? <CircularProgress size={20} /> : <StoreIcon />}
          >
            {checkoutLoading ? 'Processing Checkout...' : 'Confirm Order & Print'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Invoice Complete Confirmation Dialog */}
      <Dialog open={invoiceOpen} onClose={() => setInvoiceOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700, textAlign: 'center' }}>
          Sale Recorded Successfully!
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body1" sx={{ mb: 3 }}>
            Order has been processed and deducted from inventory stock.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<DownloadIcon />}
            fullWidth
            onClick={() => completedSaleId && downloadPDF(completedSaleId)}
            sx={{ mb: 2, py: 1.2, borderRadius: 2 }}
          >
            Download Invoice PDF
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvoiceOpen(false)} fullWidth variant="outlined">
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Sales;
