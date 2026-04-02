import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { SessionState } from '@glitter-atlas/shared'
import {
  shouldLoadPendingApprovals,
  shouldRedirectApprovedUserToDashboard,
} from './auth_gate.logic'

const baseApprovedSession: SessionState = {
  authenticated: true,
  sessionType: 'approved',
  activationRequired: false,
  email: 'user@glitter.kr',
  isSuperAdmin: false,
}

describe('AuthGate redirect regression guards', () => {
  test('super admin remains on root and can load pending approvals', () => {
    const session: SessionState = {
      ...baseApprovedSession,
      email: 'gim@glitter.kr',
      isSuperAdmin: true,
    }

    assert.equal(shouldRedirectApprovedUserToDashboard(session), false)
    assert.equal(shouldLoadPendingApprovals(session), true)
  })

  test('super admin pending approvals path stays enabled on root', () => {
    const session: SessionState = {
      ...baseApprovedSession,
      email: 'gim@glitter.kr',
      isSuperAdmin: true,
    }

    const pendingApprovals = [
      { email: 'sort3@glitter.kr', lastSeenAt: '2026-04-01T03:26:07.215Z' },
    ]

    assert.equal(shouldLoadPendingApprovals(session), true)
    assert.equal(pendingApprovals.length > 0, true)
    assert.equal(pendingApprovals[0].email, 'sort3@glitter.kr')
  })

  test('normal approved user redirects to dashboard', () => {
    assert.equal(shouldRedirectApprovedUserToDashboard(baseApprovedSession), true)
  })

  test('normal approved user does not trigger admin fetch path', () => {
    assert.equal(shouldRedirectApprovedUserToDashboard(baseApprovedSession), true)
    assert.equal(shouldLoadPendingApprovals(baseApprovedSession), false)
  })
})
