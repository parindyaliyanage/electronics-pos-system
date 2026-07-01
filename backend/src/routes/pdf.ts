import { Router, Request, Response } from 'express';
import { authenticate, AppError } from '../middleware';
import { generateInvoicePDF, generateReceiptPDF } from '../utils/pdf';

const router = Router();
router.use(authenticate);

// GET /api/pdf/invoice/:saleId
router.get('/invoice/:saleId', async (req: Request, res: Response) => {
  try {
    const buffer = await generateInvoicePDF(req.params.saleId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${req.params.saleId.substring(0, 8)}.pdf`);
    res.send(buffer);
  } catch (error: any) {
    throw new AppError(error.message || 'Failed to generate invoice', 500);
  }
});

// GET /api/pdf/receipt/sale/:paymentId
router.get('/receipt/sale/:paymentId', async (req: Request, res: Response) => {
  try {
    const buffer = await generateReceiptPDF(req.params.paymentId, 'sale');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=receipt-${req.params.paymentId.substring(0, 8)}.pdf`);
    res.send(buffer);
  } catch (error: any) {
    throw new AppError(error.message || 'Failed to generate receipt', 500);
  }
});

// GET /api/pdf/receipt/installment/:paymentId
router.get('/receipt/installment/:paymentId', async (req: Request, res: Response) => {
  try {
    const buffer = await generateReceiptPDF(req.params.paymentId, 'installment');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=installment-receipt-${req.params.paymentId.substring(0, 8)}.pdf`);
    res.send(buffer);
  } catch (error: any) {
    throw new AppError(error.message || 'Failed to generate receipt', 500);
  }
});

export default router;
