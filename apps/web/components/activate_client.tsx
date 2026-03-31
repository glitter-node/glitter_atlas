'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type SessionState = {
  authenticated: boolean;
  sessionType: 'temporary' | 'activation' | 'approved' | null;
  activationRequired: boolean;
  email: string | null;
  isSuperAdmin: boolean;
};

export function ActivateClient() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const response = await fetch('/api/auth/session', {
          credentials: 'same-origin',
        });

        if (!response.ok) {
          throw new Error('Failed to load session.');
        }

        const data = (await response.json()) as SessionState;

        if (!active) {
          return;
        }

        if (!data.authenticated || !data.activationRequired || !data.email) {
          router.replace('/');
          return;
        }

        setSession(data);
      } catch (loadError) {
        if (!active) {
          return;
        }

        const message =
          loadError instanceof Error ? loadError.message : 'Failed to load session.';
        setError(message);
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session?.email) {
      setError('Activation session is missing.');
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
    setResetMessage(null);

    try {
      const response = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          email: session.email,
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
        throw new Error(message ?? 'Failed to activate account.');
      }

      router.replace('/dashboard');
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Failed to activate account.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetEmail() {
    if (!session?.email) {
      setError('Activation session is missing.');
      return;
    }

    setIsSendingReset(true);
    setError(null);
    setResetMessage(null);

    try {
      const response = await fetch('/api/auth/activate/reset-email', {
        method: 'POST',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const message = Array.isArray(data?.message)
          ? data?.message[0]
          : data?.message;
        throw new Error(message ?? 'Failed to send activation email.');
      }

      setResetMessage(`A new activation link was sent to ${session.email}.`);
    } catch (resetError) {
      const message =
        resetError instanceof Error
          ? resetError.message
          : 'Failed to send activation email.';
      setError(message);
    } finally {
      setIsSendingReset(false);
    }
  }

  return (
    <main className="page">
      <div className="card auth-card">
        <p className="eyebrow">Account Activation</p>
        <h1>Activate your account</h1>
        {error ? <p className="status status-error">{error}</p> : null}
        {resetMessage ? <p className="status status-success">{resetMessage}</p> : null}
        {session === null ? (
          <p>Loading your approved email...</p>
        ) : (
          <>
            <p>Your approved email is fixed as your account identifier.</p>
            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Email</span>
                <input
                  className="input"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={session.email ?? ''}
                  readOnly
                  disabled
                />
              </label>
              <label className="field">
                <span>Password</span>
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
                {isSubmitting ? 'Activating...' : 'Activate account'}
              </button>
            </form>
            <div className="surface-note">
              <h2>Need a fresh activation email?</h2>
              <p>A new activation link will be sent to the same approved email shown above.</p>
              <button
                className="button button-secondary"
                type="button"
                onClick={handleResetEmail}
                disabled={isSubmitting || isSendingReset}
              >
                {isSendingReset ? 'Sending...' : 'Send activation email again'}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
