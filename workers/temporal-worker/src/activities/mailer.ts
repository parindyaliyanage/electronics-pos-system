import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | undefined;

// SMTP settings. In development these point at Mailpit (see docker-compose),
// whose web UI at http://localhost:8025 shows every email "sent".
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
      connectionTimeout: 10_000,
    });
  }
  return transporter;
}

export async function sendEmail(message: { to: string; subject: string; text: string }) {
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM ?? "SmartRetail <no-reply@smartretail.local>",
    ...message,
  });
}
