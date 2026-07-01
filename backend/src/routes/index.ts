import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import categoryRoutes from './categories';
import productRoutes from './products';
import customerRoutes from './customers';
import salesRoutes from './sales';
import inventoryRoutes from './inventory';
import installmentRoutes from './installments';
import interestRateRoutes from './interestRates';
import paymentRoutes from './payments';
import notificationRoutes from './notifications';
import settingsRoutes from './settings';
import reportRoutes from './reports';
import pdfRoutes from './pdf';
import workerRoutes from './worker';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/customers', customerRoutes);
router.use('/sales', salesRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/installments', installmentRoutes);
router.use('/interest-rates', interestRateRoutes);
router.use('/payments', paymentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/settings', settingsRoutes);
router.use('/reports', reportRoutes);
router.use('/pdf', pdfRoutes);
router.use('/worker', workerRoutes);

export default router;
