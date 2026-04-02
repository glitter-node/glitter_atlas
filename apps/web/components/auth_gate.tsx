'use client';

import type { SessionState } from '@glitter-atlas/shared';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  shouldLoadPendingApprovals,
  shouldRedirectApprovedUserToDashboard,
} from './auth_gate.logic';

type PendingApprovalCandidate = {
  email: string;
  lastSeenAt: string;
};

const emailReceivabilityWarning =
  'This email address may not be able to receive mail. Please verify the address and try again.';

const anonymousSession: SessionState = {
  authenticated: false,
  sessionType: null,
  activationRequired: false,
  email: null,
  isSuperAdmin: false,
};

export function AuthGate() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalCandidate[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const emailFromQuery = params.get('email');
    const passwordUpdated = params.get('passwordUpdated');

    if (emailFromQuery) {
      setEmail(emailFromQuery);
    }

    if (passwordUpdated === '1') {
      setSuccessMessage('Password set successfully. Please sign in.');
      return;
    }

    setSuccessMessage(null);
  }, []);

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

        if (shouldRedirectApprovedUserToDashboard(data)) {
          router.replace('/dashboard');
          return;
        }

        setSession(data);
        setEmailSent(false);
        setPasswordResetSent(false);
        setWarningMessage(null);
      } catch (fetchError) {
        if (!active) {
          return;
        }

        const message =
          fetchError instanceof Error
            ? fetchError.message
            : 'Failed to load session.';
        setError(message);
        setSession(anonymousSession);
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    let active = true;

    async function loadPendingApprovals() {
      if (session === null || !shouldLoadPendingApprovals(session)) {
        setPendingApprovals([]);
        return;
      }

      try {
        const response = await fetch('/api/auth/admin/pending-approvals', {
          credentials: 'same-origin',
        });

        if (!response.ok) {
          throw new Error('Failed to load pending approvals.');
        }

        const data = (await response.json()) as {
          items?: PendingApprovalCandidate[];
        };

        if (!active) {
          return;
        }

        setPendingApprovals(data.items ?? []);
      } catch (fetchError) {
        if (!active) {
          return;
        }

        const message =
          fetchError instanceof Error
            ? fetchError.message
            : 'Failed to load pending approvals.';
        setError(message);
        setPendingApprovals([]);
      }
    }

    void loadPendingApprovals();

    return () => {
      active = false;
    };
  }, [session?.authenticated, session?.isSuperAdmin]);

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError('Email is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    setWarningMessage(null);
    setPasswordResetSent(false);

    try {
      const response = await fetch('/api/auth/email/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const message = Array.isArray(data?.message)
          ? data?.message[0]
          : data?.message;
        throw new Error(message ?? 'Failed to start email sign-in.');
      }

      setEmailSent(true);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Failed to start email sign-in.';

      if (message === emailReceivabilityWarning) {
        setWarningMessage(message);
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError('Email is required.');
      return;
    }

    if (!password.trim()) {
      setError('Password is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    setWarningMessage(null);
    setPasswordResetSent(false);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          email: normalizedEmail,
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
        throw new Error(message ?? 'Failed to sign in with password.');
      }

      const data = (await response.json()) as SessionState;
      setSession({
        ...data,
        authenticated: true,
      });
      setEmail('');
      setPassword('');
      setEmailSent(false);
      setPendingApprovals([]);
      if (shouldRedirectApprovedUserToDashboard(data)) {
        router.replace('/dashboard');
      }
    } catch (loginError) {
      const message =
        loginError instanceof Error
          ? loginError.message
          : 'Failed to sign in with password.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function startPasswordReset(emailAddress: string) {
    const normalizedEmail = emailAddress.trim();

    if (!normalizedEmail) {
      setError('Email is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    setWarningMessage(null);
    setPasswordResetSent(false);

    try {
      const response = await fetch('/api/auth/password-reset/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const message = Array.isArray(data?.message)
          ? data?.message[0]
          : data?.message;
        throw new Error(message ?? 'Failed to send password setup email.');
      }

      setPasswordResetSent(true);
    } catch (resetError) {
      const message =
        resetError instanceof Error
          ? resetError.message
          : 'Failed to send password setup email.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    await startPasswordReset(email);
  }

  async function handleLogout() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/logout', {
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
        throw new Error(message ?? 'Failed to log out.');
      }

      setSession(anonymousSession);
      setPendingApprovals([]);
      setEmail('');
      setPassword('');
      setEmailSent(false);
      setPasswordResetSent(false);
    } catch (logoutError) {
      const message =
        logoutError instanceof Error ? logoutError.message : 'Failed to log out.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleApprove(emailToApprove: string) {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/admin/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ email: emailToApprove }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const message = Array.isArray(data?.message)
          ? data?.message[0]
          : data?.message;
        throw new Error(message ?? 'Failed to approve email.');
      }

      setPendingApprovals((current) =>
        current.filter((candidate) => candidate.email !== emailToApprove),
      );
    } catch (approvalError) {
      const message =
        approvalError instanceof Error
          ? approvalError.message
          : 'Failed to approve email.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleStartUsing() {
    router.push('/dashboard');
  }

  return (
    <main className="page">
      <div className="card auth-card">
        <div className="hero-copy">
          <p className="eyebrow">GlitterAtlas Access</p>
          <h1>
            {session === null
              ? 'Checking your access'
              : !session.authenticated
                ? emailSent
                  ? 'Check your email'
                  : 'Sign in to the archive'
                : session.sessionType === 'temporary'
                  ? 'Temporary access'
                  : session.activationRequired
                    ? 'Activate your account'
                  : 'Signed in'}
          </h1>
        </div>
        {session === null ? (
          <>
            <p>Loading your current session.</p>
          </>
        ) : (
          <>
            {error ? <p className="status status-error">{error}</p> : null}
            {successMessage ? <p className="status status-success">{successMessage}</p> : null}
            {!session.authenticated ? (
              emailSent ? (
                <>
                  <p>We sent a sign-in link to the email address you entered.</p>
                  <div className="surface-note">
                    <h2>Next step</h2>
                    <p>Open the link in your inbox to verify access and continue activation.</p>
                  </div>
                <div className="surface-note">
                    <h2>Access policy</h2>
                    <p>Only verified access can proceed.</p>
                  </div>
                </>
              ) : (
                <>
                  {passwordResetSent ? (
                    <div className="surface-note">
                      <h2>Password email sent</h2>
                      <p>Use the email link to complete activation or reset your password, then return here to sign in.</p>
                    </div>
                  ) : null}
                  <p>Access is limited to approved or previously activated accounts. This is not a public registration service.</p>
                  <div className="surface-note">
                    <h2>Before you continue</h2>
                    <p>If you have completed email verification, set your password and sign in.</p>
                    <p>If you have not yet activated access, complete the verification process first.</p>
                  </div>
                  <form className="auth-form" onSubmit={handlePasswordLogin}>
                    <label className="field">
                      <span>Email</span>
                      <input
                        className="input"
                        type="email"
                        name="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        disabled={isSubmitting}
                      />
                    </label>
                    <label className="field">
                      <span>Password</span>
                      <input
                        className="input"
                        type="password"
                        name="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={isSubmitting}
                      />
                    </label>
                    <button className="button" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Signing in...' : 'Sign in'}
                    </button>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={handlePasswordReset}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Working...' : 'Set or reset password via email'}
                    </button>
                  </form>
                  <div className="surface-note">
                    <h2>Verified access</h2>
                    <p>Use a one-time email link only to verify access or continue activation.</p>
                  </div>
                  <div className="surface-note">
                    <h2>Support note</h2>
                    <p>If you cannot access your account, use the password reset option or request access again using the same email.</p>
                  </div>
                  <p>Only verified access can proceed.</p>
                  <form className="auth-form" onSubmit={handleEmailSubmit}>
                    <label className="field">
                      <span>Email</span>
                      <input
                        className="input"
                        type="email"
                        name="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        disabled={isSubmitting}
                      />
                    </label>
                    <button className="button" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Sending...' : 'Send sign-in link'}
                    </button>
                  </form>
                </>
              )
            ) : session.sessionType === 'temporary' ? (
              <>
                <p className="status-badge status-badge-temporary">Verified email</p>
                <dl className="session-meta">
                  <div>
                    <dt>Session type</dt>
                    <dd>temporary</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{session.email}</dd>
                  </div>
                </dl>
                <p>Your request has verified access. Complete activation by setting your password, then sign in normally.</p>
                <div className="surface-note">
                  <h2>Current access</h2>
                  <p>This is a restricted archive. Temporary access remains limited until activation is complete.</p>
                </div>
                <div className="surface-note">
                  <h2>Activation</h2>
                  <p>Send yourself a password setup email, complete the link, then return to sign in to the archive.</p>
                </div>
                {passwordResetSent ? (
                  <div className="surface-note">
                    <h2>Password email sent</h2>
                    <p>Open the email link in your inbox to finish first-time password setup.</p>
                  </div>
                ) : null}
                <button
                  className="button"
                  type="button"
                  onClick={() => void startPasswordReset(session.email ?? '')}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Sending...' : 'Send password setup email'}
                </button>
                <button className="button button-secondary" type="button" onClick={handleLogout} disabled={isSubmitting}>
                  {isSubmitting ? 'Signing out...' : 'Log out'}
                </button>
              </>
            ) : session.activationRequired ? (
              <>
                <p className="status-badge status-badge-temporary">Activation required</p>
                <dl className="session-meta">
                  <div>
                    <dt>Session type</dt>
                    <dd>{session.sessionType}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{session.email}</dd>
                  </div>
                </dl>
                <p>Your account has verified access, but activation is not complete yet.</p>
                <div className="surface-note">
                  <h2>Activation</h2>
                  <p>Finish activation to create your password and continue into the archive.</p>
                </div>
                <a className="button button-link" href="/auth/activate">
                  Activate account
                </a>
                <button className="button" type="button" onClick={handleLogout} disabled={isSubmitting}>
                  {isSubmitting ? 'Signing out...' : 'Log out'}
                </button>
              </>
            ) : (
              <>
                <p className="status-badge status-badge-approved">
                  {session.isSuperAdmin ? 'Super admin' : 'Approved access'}
                </p>
                <p>Your account is signed in and ready to continue.</p>
                <div className="surface-note">
                  <h2>Next step</h2>
                  <p>Continue to your dashboard to start using GlitterAtlas.</p>
                </div>
                <div className="button-row">
                  <button className="button" type="button" onClick={handleStartUsing}>
                    Start using GlitterAtlas
                  </button>
                  <button className="button button-secondary" type="button" onClick={handleLogout} disabled={isSubmitting}>
                    {isSubmitting ? 'Signing out...' : 'Log out'}
                  </button>
                </div>
                {session.isSuperAdmin ? (
                  <div className="surface-note surface-note-admin">
                    <h2>Admin-only actions</h2>
                    <p>Abandoned upload cleanup is available for this session.</p>
                  </div>
                ) : null}
                {session.isSuperAdmin ? (
                  <div className="surface-note surface-note-admin">
                    <h2>Pending approvals</h2>
                    {pendingApprovals.length === 0 ? (
                      <p>No pending temporary users are waiting for approval.</p>
                    ) : (
                      <div className="approval-list">
                        {pendingApprovals.map((candidate) => (
                          <div className="approval-item" key={candidate.email}>
                            <div>
                              <p className="approval-email">{candidate.email}</p>
                              <p className="approval-meta">
                                Last seen {new Date(candidate.lastSeenAt).toLocaleString()}
                              </p>
                            </div>
                            <button
                              className="button button-secondary"
                              type="button"
                              onClick={() => handleApprove(candidate.email)}
                              disabled={isSubmitting}
                            >
                              {isSubmitting ? 'Working...' : 'Approve'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
      {warningMessage ? (
        <div className="dialog-backdrop" role="presentation">
          <div className="card dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="auth-warning-title">
            <p className="eyebrow">Mail Check</p>
            <h2 id="auth-warning-title">Email warning</h2>
            <p>{warningMessage}</p>
            <div className="button-row dialog-actions">
              <button className="button button-secondary" type="button" onClick={() => setWarningMessage(null)}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
