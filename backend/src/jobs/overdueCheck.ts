import cron from 'node-cron';
import { query } from '../database/pool';

/**
 * Scheduled job that runs daily at midnight to:
 * 1. Mark overdue installment plans
 * 2. Generate notifications for overdue and upcoming due payments
 */
export function startScheduledJobs(): void {
  // Run every day at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('🔄 Running scheduled overdue check...');
    try {
      await checkOverdueInstallments();
      await checkUpcomingDuePayments();
      console.log('✅ Scheduled jobs completed');
    } catch (error) {
      console.error('❌ Scheduled job error:', error);
    }
  });

  console.log('⏰ Scheduled jobs registered (daily at midnight)');
}

async function checkOverdueInstallments(): Promise<void> {
  // Find active plans past their due date and flip to overdue
  const { rows: overduePlans } = await query(
    `UPDATE installment_plans
     SET status = 'overdue'
     WHERE status = 'active' AND next_due_date < CURRENT_DATE
     RETURNING id, customer_id, remaining_balance, next_due_date`
  );

  if (overduePlans.length > 0) {
    console.log(`  ⚠️ Marked ${overduePlans.length} plans as overdue`);

    for (const plan of overduePlans) {
      const { rows: customerRows } = await query(
        `SELECT name FROM customers WHERE id = $1`, [plan.customer_id]
      );
      const customerName = customerRows[0]?.name || 'Unknown';

      // Notify all admins
      await query(
        `INSERT INTO notifications (user_id, type, title, message, metadata)
         SELECT id, 'overdue_payment', 'Overdue Payment', $1, $2
         FROM users WHERE role = 'admin' AND is_active = true`,
        [
          `Installment plan for ${customerName} is overdue. Due date was ${plan.next_due_date}. Remaining: ${Number(plan.remaining_balance).toFixed(2)}`,
          JSON.stringify({ plan_id: plan.id, customer_id: plan.customer_id }),
        ]
      );
    }
  }
}

async function checkUpcomingDuePayments(): Promise<void> {
  // Find plans due within 3 days
  const { rows: upcomingPlans } = await query(
    `SELECT ip.id, ip.customer_id, ip.monthly_payment, ip.next_due_date, c.name as customer_name
     FROM installment_plans ip
     JOIN customers c ON ip.customer_id = c.id
     WHERE ip.status = 'active'
       AND ip.next_due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'`
  );

  if (upcomingPlans.length > 0) {
    console.log(`  📅 ${upcomingPlans.length} plans due within 3 days`);

    for (const plan of upcomingPlans) {
      // Notify all workers and admins
      await query(
        `INSERT INTO notifications (user_id, type, title, message, metadata)
         SELECT id, 'installment_due_soon', 'Payment Due Soon', $1, $2
         FROM users WHERE is_active = true
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.user_id = users.id AND n.type = 'installment_due_soon'
             AND n.metadata->>'plan_id' = $3
             AND n.created_at > CURRENT_DATE - INTERVAL '3 days'
         )`,
        [
          `${plan.customer_name}'s installment payment of ${Number(plan.monthly_payment).toFixed(2)} is due on ${plan.next_due_date}`,
          JSON.stringify({ plan_id: plan.id, customer_id: plan.customer_id }),
          plan.id,
        ]
      );
    }
  }
}

/**
 * Manual check that can be called on user login
 */
export async function checkOverdueOnLogin(): Promise<void> {
  try {
    await checkOverdueInstallments();
  } catch (error) {
    console.error('Overdue check on login failed:', error);
  }
}
