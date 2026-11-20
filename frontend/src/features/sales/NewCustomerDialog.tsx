import { useState, type FormEvent } from "react";
import { errorMessage } from "../../api/client";
import { createCustomer } from "../../api/pos";
import type { CreateCustomerResult } from "../../api/types";
import { Modal } from "../../components/Modal";

// Same rules as backend/src/customers/dto/create-customer.dto.ts.
const PHONE = /^\+?[0-9]{7,15}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizePhone = (value: string) => value.replace(/[\s()-]/g, "");

interface Form {
  fullName: string;
  phone: string;
  email: string;
  address: string;
}
type Errors = Partial<Record<keyof Form, string>>;

function validate(form: Form): Errors {
  const errors: Errors = {};
  if (!form.fullName.trim()) errors.fullName = "Enter the customer's name.";
  else if (form.fullName.trim().length > 200) errors.fullName = "Name must be 200 characters or fewer.";
  if (!form.phone.trim()) errors.phone = "Enter a phone number.";
  else if (!PHONE.test(normalizePhone(form.phone))) errors.phone = "Use 7 to 15 digits, optionally starting with +.";
  if (form.email.trim() && !EMAIL.test(form.email.trim())) errors.email = "Enter a valid email address.";
  if (form.address.trim().length > 500) errors.address = "Address must be 500 characters or fewer.";
  return errors;
}

interface Props {
  initialName?: string;
  onCreated: (result: CreateCustomerResult) => void;
  onClose: () => void;
}

export function NewCustomerDialog({ initialName = "", onCreated, onClose }: Props) {
  // A search that looks like a phone number pre-fills the phone, otherwise the name.
  const looksLikePhone = /^[+\d\s()-]{5,}$/.test(initialName);
  const [form, setForm] = useState<Form>({
    fullName: looksLikePhone ? "" : initialName,
    phone: looksLikePhone ? initialName : "",
    email: "",
    address: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const set = (field: keyof Form, value: string) => {
    const next = { ...form, [field]: value };
    setForm(next);
    if (touched) setErrors(validate(next));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setServerError(null);
    try {
      onCreated(await createCustomer({
        fullName: form.fullName.trim(),
        phone: normalizePhone(form.phone),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.address.trim() ? { address: form.address.trim() } : {}),
      }));
    } catch (err) {
      setServerError(errorMessage(err));
      setSaving(false);
    }
  };

  const field = (name: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={`field${errors[name] ? " has-error" : ""}`}>
      <label htmlFor={`customer-${name}`}>{label}</label>
      <input
        id={`customer-${name}`}
        value={form[name]}
        onChange={(e) => set(name, e.target.value)}
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `customer-${name}-error` : undefined}
        {...props}
      />
      {errors[name] && <p className="field-error" id={`customer-${name}-error`}>{errors[name]}</p>}
    </div>
  );

  return (
    <Modal
      title="New customer"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="new-customer-form" className="button button-primary" disabled={saving}>
            {saving ? "Saving…" : "Save customer"}
          </button>
        </>
      )}
    >
      <form id="new-customer-form" onSubmit={submit} noValidate>
        {serverError && <div className="alert alert-error" role="alert">{serverError}</div>}
        {field("fullName", "Full name", { autoComplete: "off" })}
        {field("phone", "Phone", { type: "tel", inputMode: "tel", placeholder: "0771234567 or +94771234567" })}
        {field("email", "Email (optional)", { type: "email" })}
        {field("address", "Address (optional)")}
      </form>
    </Modal>
  );
}
