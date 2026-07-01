import PDFDocument from 'pdfkit';
import { query } from '../database/pool';

interface InvoiceItem {
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface InvoiceData {
  invoiceNumber: string;
  date: string;
  customer: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  } | null;
  employee: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  installmentInfo?: {
    principal: number;
    interestRate: number;
    duration: number;
    monthlyPayment: number;
    totalRepayment: number;
    totalInterest: number;
  };
  storeName: string;
  storeAddress: string;
  storePhone: string;
  currency: string;
}

async function getStoreSettings(): Promise<{ name: string; address: string; phone: string; currency: string }> {
  const { rows } = await query(`SELECT key, value FROM settings WHERE key IN ('store_name', 'store_address', 'store_phone', 'currency_symbol')`);
  const settings: Record<string, string> = {};
  rows.forEach((r: any) => { settings[r.key] = r.value; });
  return {
    name: settings.store_name || 'ElectroStore',
    address: settings.store_address || '',
    phone: settings.store_phone || '',
    currency: settings.currency_symbol || 'Rs.',
  };
}

export async function generateInvoicePDF(saleId: string): Promise<Buffer> {
  // Fetch sale data
  const { rows: saleRows } = await query(
    `SELECT s.*, u.full_name as employee_name,
            c.name as customer_name, c.phone as customer_phone,
            c.email as customer_email, c.address as customer_address
     FROM sales s
     JOIN users u ON s.employee_id = u.id
     LEFT JOIN customers c ON s.customer_id = c.id
     WHERE s.id = $1`,
    [saleId]
  );

  if (saleRows.length === 0) throw new Error('Sale not found');
  const sale = saleRows[0];

  // Fetch items
  const { rows: itemRows } = await query(
    `SELECT si.quantity, si.unit_price, p.name
     FROM sale_items si
     JOIN products p ON si.product_id = p.id
     WHERE si.sale_id = $1`,
    [saleId]
  );

  // Fetch installment info if applicable
  let installmentInfo;
  if (sale.payment_method === 'installment') {
    const { rows: planRows } = await query(
      `SELECT * FROM installment_plans WHERE sale_id = $1 LIMIT 1`,
      [saleId]
    );
    if (planRows.length > 0) {
      const plan = planRows[0];
      const totalInterest = Number(plan.principal) * (Number(plan.interest_rate) / 100);
      installmentInfo = {
        principal: Number(plan.principal),
        interestRate: Number(plan.interest_rate),
        duration: plan.duration_months,
        monthlyPayment: Number(plan.monthly_payment),
        totalRepayment: Number(plan.principal) + totalInterest,
        totalInterest,
      };
    }
  }

  const store = await getStoreSettings();

  const invoiceData: InvoiceData = {
    invoiceNumber: `INV-${saleId.substring(0, 8).toUpperCase()}`,
    date: new Date(sale.sale_date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    }),
    customer: sale.customer_name ? {
      name: sale.customer_name,
      phone: sale.customer_phone,
      email: sale.customer_email,
      address: sale.customer_address,
    } : null,
    employee: sale.employee_name,
    items: itemRows.map((item: any) => ({
      name: item.name,
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      total: item.quantity * Number(item.unit_price),
    })),
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    tax: Number(sale.tax),
    total: Number(sale.total),
    paymentMethod: sale.payment_method,
    installmentInfo,
    storeName: store.name,
    storeAddress: store.address,
    storePhone: store.phone,
    currency: store.currency,
  };

  return createPDF(invoiceData);
}

export async function generateReceiptPDF(paymentId: string, type: 'sale' | 'installment'): Promise<Buffer> {
  const store = await getStoreSettings();
  const doc = new PDFDocument({ size: [226, 600], margin: 10 }); // Receipt-sized
  const buffers: Buffer[] = [];

  doc.on('data', (chunk: any) => buffers.push(chunk));

  // Header
  doc.fontSize(12).font('Helvetica-Bold').text(store.name, { align: 'center' });
  doc.fontSize(7).font('Helvetica').text(store.address, { align: 'center' });
  doc.text(store.phone, { align: 'center' });
  doc.moveDown(0.5);
  doc.text('─'.repeat(30), { align: 'center' });

  if (type === 'installment') {
    // Installment payment receipt
    const { rows } = await query(
      `SELECT ip.amount, ip.paid_at,
              ipl.principal, ipl.interest_rate, ipl.duration_months,
              ipl.monthly_payment, ipl.remaining_balance, ipl.status,
              c.name as customer_name
       FROM installment_payments ip
       JOIN installment_plans ipl ON ip.plan_id = ipl.id
       JOIN customers c ON ipl.customer_id = c.id
       WHERE ip.id = $1`,
      [paymentId]
    );

    if (rows.length === 0) throw new Error('Payment not found');
    const payment = rows[0];

    doc.fontSize(9).font('Helvetica-Bold').text('INSTALLMENT PAYMENT RECEIPT', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(7).font('Helvetica');
    doc.text(`Date: ${new Date(payment.paid_at).toLocaleString()}`);
    doc.text(`Customer: ${payment.customer_name}`);
    doc.text('─'.repeat(30), { align: 'center' });
    doc.text(`Amount Paid: ${store.currency} ${Number(payment.amount).toFixed(2)}`);
    doc.text(`Remaining: ${store.currency} ${Number(payment.remaining_balance).toFixed(2)}`);
    doc.text(`Status: ${payment.status}`);
    doc.moveDown(0.3);
    doc.text('─'.repeat(30), { align: 'center' });
    doc.fontSize(6).text('Thank you for your payment!', { align: 'center' });
  } else {
    // Sale payment receipt
    const { rows } = await query(
      `SELECT p.amount, p.method, p.paid_at, s.total, s.id as sale_id,
              c.name as customer_name
       FROM payments p
       JOIN sales s ON p.sale_id = s.id
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE p.id = $1`,
      [paymentId]
    );

    if (rows.length === 0) throw new Error('Payment not found');
    const payment = rows[0];

    doc.fontSize(9).font('Helvetica-Bold').text('PAYMENT RECEIPT', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(7).font('Helvetica');
    doc.text(`Date: ${new Date(payment.paid_at).toLocaleString()}`);
    if (payment.customer_name) doc.text(`Customer: ${payment.customer_name}`);
    doc.text('─'.repeat(30), { align: 'center' });
    doc.text(`Amount: ${store.currency} ${Number(payment.amount).toFixed(2)}`);
    doc.text(`Method: ${payment.method}`);
    doc.moveDown(0.3);
    doc.text('─'.repeat(30), { align: 'center' });
    doc.fontSize(6).text('Thank you for your purchase!', { align: 'center' });
  }

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });
}

function createPDF(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk: any) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // ── Header ──
    doc.fontSize(20).font('Helvetica-Bold').text(data.storeName, 50, 50);
    doc.fontSize(9).font('Helvetica').text(data.storeAddress, 50, 75);
    doc.text(data.storePhone);

    doc.fontSize(20).font('Helvetica-Bold').text('INVOICE', 400, 50, { align: 'right' });
    doc.fontSize(10).font('Helvetica');
    doc.text(`# ${data.invoiceNumber}`, 400, 75, { align: 'right' });
    doc.text(`Date: ${data.date}`, 400, 90, { align: 'right' });
    doc.text(`Payment: ${data.paymentMethod.toUpperCase()}`, 400, 105, { align: 'right' });

    doc.moveDown(2);

    // ── Customer ──
    if (data.customer) {
      const custY = 140;
      doc.fontSize(10).font('Helvetica-Bold').text('Bill To:', 50, custY);
      doc.fontSize(10).font('Helvetica');
      doc.text(data.customer.name, 50, custY + 15);
      if (data.customer.phone) doc.text(data.customer.phone);
      if (data.customer.email) doc.text(data.customer.email);
      if (data.customer.address) doc.text(data.customer.address);
    }

    doc.text(`Served by: ${data.employee}`, 400, 140, { align: 'right' });

    // ── Items Table ──
    const tableTop = 230;
    doc.font('Helvetica-Bold').fontSize(9);

    // Table header
    doc.rect(50, tableTop - 5, 500, 20).fill('#333333');
    doc.fillColor('#FFFFFF');
    doc.text('Product', 55, tableTop, { width: 230 });
    doc.text('Qty', 290, tableTop, { width: 50, align: 'center' });
    doc.text('Unit Price', 340, tableTop, { width: 100, align: 'right' });
    doc.text('Total', 445, tableTop, { width: 100, align: 'right' });
    doc.fillColor('#000000');

    // Table rows
    doc.font('Helvetica').fontSize(9);
    let y = tableTop + 25;

    data.items.forEach((item, i) => {
      if (i % 2 === 0) {
        doc.rect(50, y - 5, 500, 20).fill('#F5F5F5');
        doc.fillColor('#000000');
      }
      doc.text(item.name, 55, y, { width: 230 });
      doc.text(String(item.quantity), 290, y, { width: 50, align: 'center' });
      doc.text(`${data.currency} ${item.unit_price.toFixed(2)}`, 340, y, { width: 100, align: 'right' });
      doc.text(`${data.currency} ${item.total.toFixed(2)}`, 445, y, { width: 100, align: 'right' });
      y += 20;
    });

    // ── Totals ──
    y += 10;
    doc.moveTo(350, y).lineTo(550, y).stroke();
    y += 10;

    const drawTotal = (label: string, value: number, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9);
      doc.text(label, 350, y, { width: 100, align: 'right' });
      doc.text(`${data.currency} ${value.toFixed(2)}`, 455, y, { width: 90, align: 'right' });
      y += 18;
    };

    drawTotal('Subtotal:', data.subtotal);
    if (data.discount > 0) drawTotal('Discount:', -data.discount);
    if (data.tax > 0) drawTotal('Tax:', data.tax);
    doc.moveTo(350, y - 5).lineTo(550, y - 5).stroke();
    drawTotal('TOTAL:', data.total, true);

    // ── Installment Info ──
    if (data.installmentInfo) {
      y += 10;
      doc.font('Helvetica-Bold').fontSize(11).text('Installment Plan Details', 50, y);
      y += 20;
      doc.font('Helvetica').fontSize(9);
      doc.text(`Principal Amount: ${data.currency} ${data.installmentInfo.principal.toFixed(2)}`, 50, y); y += 15;
      doc.text(`Interest Rate: ${data.installmentInfo.interestRate}% (flat)`, 50, y); y += 15;
      doc.text(`Duration: ${data.installmentInfo.duration} months`, 50, y); y += 15;
      doc.text(`Total Interest: ${data.currency} ${data.installmentInfo.totalInterest.toFixed(2)}`, 50, y); y += 15;
      doc.text(`Total Repayment: ${data.currency} ${data.installmentInfo.totalRepayment.toFixed(2)}`, 50, y); y += 15;
      doc.font('Helvetica-Bold');
      doc.text(`Monthly Payment: ${data.currency} ${data.installmentInfo.monthlyPayment.toFixed(2)}`, 50, y); y += 15;
    }

    // ── Footer ──
    doc.fontSize(8).font('Helvetica')
      .text('Thank you for your purchase!', 50, 750, { align: 'center', width: 500 });

    doc.end();
  });
}
