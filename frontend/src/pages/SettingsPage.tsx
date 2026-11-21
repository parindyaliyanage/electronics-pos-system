// FR5 / FR6 — installment policy (Administrator): interest rate, reminder and grace days
import axios from "axios";
import { useEffect, useState, type FormEvent } from "react";
import { errorMessage } from "../api/client";
import { getPolicyDetail, updatePolicy } from "../api/installments";
import type { PolicyDetail } from "../api/types";
import { formatDateTime } from "../lib/documents";

interface Form {
  rate: string;
  reminder: string;
  grace: string;
}

// UpdateInstallmentPolicyDto: interestRate 0–1 with 4 decimals (so 0–100% with 2), reminder 0–30, grace 0–60.
function validate(form: Form) {
  const errors: Partial<Record<keyof Form, string>> = {};
  if (!/^\d+(\.\d{1,2})?$/.test(form.rate.trim()) || Number(form.rate) > 100) errors.rate = "Enter a percentage from 0 to 100 (up to 2 decimals).";
  if (!/^\d+$/.test(form.reminder.trim()) || Number(form.reminder) > 30) errors.reminder = "Enter 0–30 days.";
  if (!/^\d+$/.test(form.grace.trim()) || Number(form.grace) > 60) errors.grace = "Enter 0–60 days.";
  return errors;
}

const toPercent = (fraction: string) => String(Math.round(Number(fraction) * 10000) / 100);

export default function SettingsPage() {
  const [policy, setPolicy] = useState<PolicyDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState<Form>({ rate: "", reminder: "3", grace: "5" });
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = (p: PolicyDetail) => {
    setPolicy(p);
    setForm({ rate: toPercent(p.interestRate), reminder: String(p.reminderDaysBefore), grace: String(p.gracePeriodDays) });
  };

  useEffect(() => {
    getPolicyDetail().then(load).catch((err) => {
      if (axios.isAxiosError(err) && err.response?.status === 404) setMissing(true);
      else setError(errorMessage(err));
    });
  }, []);

  const errors = validate(form);
  const set = (key: keyof Form, value: string) => setForm({ ...form, [key]: value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      // Percent with 2 decimals -> fraction with 4, computed in whole basis points to avoid float noise.
      const interestRate = Math.round(Number(form.rate) * 100) / 10000;
      await updatePolicy({ interestRate, reminderDaysBefore: Number(form.reminder), gracePeriodDays: Number(form.grace) });
      // The save response doesn't include who changed it; reload for "Last changed … by …".
      load(await getPolicyDetail());
      setMissing(false);
      setNotice("Settings saved. They apply to installment plans created from now on.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof Form, label: string, suffix: string, help: string) => (
    <div className={`field${attempted && errors[key] ? " has-error" : ""}`}>
      <label htmlFor={`s-${key}`}>{label}</label>
      <div className="input-suffix">
        <input id={`s-${key}`} inputMode="decimal" value={form[key]} onChange={(e) => set(key, e.target.value)} />
        <span>{suffix}</span>
      </div>
      {attempted && errors[key] ? <p className="field-error">{errors[key]}</p> : <p className="muted small">{help}</p>}
    </div>
  );

  return (
    <section className="panel settings-panel">
      <h2 className="panel-title">Installment settings</h2>
      {missing && <div className="alert alert-warning" role="status">No interest rate is set yet, so installment sales are blocked at the POS. Save the settings below.</div>}
      {notice && <div className="alert alert-info" role="status">{notice}</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <form onSubmit={submit} noValidate>
        {field("rate", "Interest rate", "% flat", "Charged once on the financed amount (price − deposit), e.g. 10% of 120,000 = 12,000.")}
        <div className="field-row">
          {field("reminder", "Send reminder", "days before", "The customer is emailed this many days before each due date.")}
          {field("grace", "Grace period", "days after", "An unpaid installment becomes overdue this many days after its due date.")}
        </div>
        <p className="muted small">
          Changes don't affect existing plans: each plan keeps the interest rate it was sold with, and its reminders keep the timing they started with.
        </p>
        <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
        {policy && (
          <p className="muted small settings-meta">
            Last changed {formatDateTime(policy.updatedAt)}{policy.updatedBy ? ` by ${policy.updatedBy.email}` : ""}.
          </p>
        )}
      </form>
    </section>
  );
}
