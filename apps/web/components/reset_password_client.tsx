'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type PasswordResetTarget = {
  ok: boolean;
  email: string;
};

export function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selector = searchParams.get('selector');
  const token = searchParams.get('token');

  useEffect(() => {
    let active = true;

    async function loadTarget() {
      if (!selector || !token) {
        setError('Reset link is incomplete.');
        return;
      }

      try {
        const response = await fetch(
          `/api/auth/password-reset/target?selector=${encodeURIComponent(selector)}&token=${encodeURIComponent(token)}`,
          {
            credentials: 'same-origin',
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { message?: string | string[] }
            | null;
          const message = Array.isArray(data?.message)
            ? data?.message[0]
            : data?.message;
          throw new Error(message ?? 'Failed to load reset link.');
        }

        const data = (await response.json()) as PasswordResetTarget;

        if (!active) {
          return;
        }

        setEmail(data.email);
      } catch (loadError) {
        if (!active) {
          return;
        }

        const message =
          loadError instanceof Error ? loadError.message : 'Failed to load reset link.';
        setError(message);
      }
    }

    void loadTarget();

    return () => {
      active = false;
    };
  }, [selector, token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selector || !token) {
      setError('Reset link is incomplete.');
      return;
    }

    if (!email) {
      setError('Reset link is not ready.');
      return;
    }

    if (!password) {
      setError('Password is required.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== passwordConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/password-reset/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          selector,
          token,
          email,
          password,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const message = Array.isArray(data?.message)
          ? data?.message[0]
          : data?.message;
        throw new Error(message ?? 'Failed to reset password.');
      }

      router.replace('/');
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Failed to reset password.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page">
      <div className="card auth-card">
        <p className="eyebrow">Password Reset</p>
        <h1>Reset your password</h1>
        {error ? <p className="status status-error">{error}</p> : null}
        {email === null ? (
          <p>Loading your approved email...</p>
        ) : (
          <>
            <p>Your approved email remains the fixed account identifier.</p>
            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Email</span>
                <input
                  className="input"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  readOnly
                  disabled
                />
              </label>
              <label className="field">
                <span>New password</span>
                <input
                  className="input"
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSubmitting}
                />
              </label>
              <label className="field">
                <span>Confirm password</span>
                <input
                  className="input"
                  type="password"
                  name="passwordConfirm"
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  disabled={isSubmitting}
                />
              </label>
              <button className="button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Set new password'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
