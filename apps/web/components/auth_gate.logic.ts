import type { SessionState } from '@glitter-atlas/shared';

export function shouldRedirectApprovedUserToDashboard(session: SessionState) {
  return session.sessionType === 'approved' && !session.isSuperAdmin;
}

export function shouldLoadPendingApprovals(session: SessionState) {
  return session.authenticated && session.isSuperAdmin;
}
