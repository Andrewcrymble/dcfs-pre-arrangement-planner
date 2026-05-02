"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ChangePasswordPage() {
  const [name, setName] = useState<string>("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (d?.name) setName(d.name);
      })
      .catch(() => {
        // ignore — page works without the welcome line
      });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not change password.");
      } else {
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md">
      <h1 className="heading-serif text-3xl text-navy-900 sm:text-4xl">
        Change password
      </h1>
      {name && (
        <p className="mt-2 text-mist-400">
          Signed in as <span className="font-semibold text-navy-800">{name}</span>.
        </p>
      )}

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl bg-white p-6 shadow-soft sm:p-8">
        <div>
          <label className="field-label" htmlFor="cp-current">Current password</label>
          <input
            id="cp-current"
            type="password"
            className="field-input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={busy}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="cp-new">New password</label>
          <input
            id="cp-new"
            type="password"
            className="field-input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            disabled={busy}
          />
          <p className="mt-1 text-xs text-mist-400">At least 8 characters.</p>
        </div>
        <div>
          <label className="field-label" htmlFor="cp-confirm">Confirm new password</label>
          <input
            id="cp-confirm"
            type="password"
            className="field-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={busy}
          />
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
            Password updated. Use the new password next time you sign in.
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Link href="/" className="btn-secondary text-center">
            ← Back to dashboard
          </Link>
          <button
            type="submit"
            disabled={busy || !currentPassword || !newPassword || !confirmPassword}
            className="btn-primary"
          >
            {busy ? "Saving…" : "Update password"}
          </button>
        </div>
      </form>
    </div>
  );
}
