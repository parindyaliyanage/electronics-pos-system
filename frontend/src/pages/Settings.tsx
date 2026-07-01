import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  Alert,
  CircularProgress,
  Grid,
} from '@mui/material';
import {
  Save as SaveIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Settings fields
  const [storeName, setStoreName] = useState('ElectroStore');
  const [storeAddress, setStoreAddress] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('Rs.');
  const [taxRate, setTaxRate] = useState<number>(0);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/settings');
      const settings = res.data;
      setStoreName(settings.store_name || 'ElectroStore');
      setStoreAddress(settings.store_address || '');
      setStorePhone(settings.store_phone || '');
      setCurrencySymbol(settings.currency_symbol || 'Rs.');
      setTaxRate(Number(settings.tax_rate) || 0);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch store settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchSettings();
    }
  }, [isAdmin]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      store_name: storeName,
      store_address: storeAddress,
      store_phone: storePhone,
      currency_symbol: currencySymbol,
      tax_rate: Number(taxRate),
    };

    try {
      await apiClient.put('/settings', payload);
      setSuccess('Store settings updated successfully.');
      fetchSettings();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to update store settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Access Denied. You do not have permissions to manage store configurations.</Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Global Settings
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Configure business details, default tax rules, and local pricing formats
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

      <Paper sx={{ p: 4, maxWidth: 650 }}>
        <form onSubmit={handleSaveSettings}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                General Retail Store Information
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Store Name"
                fullWidth
                required
                variant="outlined"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                disabled={saving}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Store Physical Address"
                fullWidth
                multiline
                rows={2}
                variant="outlined"
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                disabled={saving}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Store Contact Phone"
                fullWidth
                variant="outlined"
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                disabled={saving}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                Pricing & Taxation Rules
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                label="Currency Symbol"
                fullWidth
                required
                variant="outlined"
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
                disabled={saving}
                helperText="E.g. Rs., $, £, €"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Standard Tax Rate (%)"
                type="number"
                fullWidth
                required
                variant="outlined"
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
                disabled={saving}
                helperText="Default VAT/sales tax percentage"
              />
            </Grid>

            <Grid item xs={12} sx={{ mt: 2 }}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                startIcon={<SaveIcon />}
                disabled={saving}
                sx={{ px: 3, py: 1.2, borderRadius: 2 }}
              >
                {saving ? 'Saving changes...' : 'Save Settings'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Box>
  );
};

export default Settings;
