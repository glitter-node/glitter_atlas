import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, test } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import { AuthService } from './auth.service'

type RecordedQuery = {
  sql: string
  values: readonly unknown[] | undefined
}

describe('AuthService pending-approval durability regression guards', () => {
  test('logout only revokes auth_sessions and does not touch pending approval rows', async () => {
    const queries: RecordedQuery[] = []
    const service = createAuthService(async (sql, values) => {
      queries.push({ sql, values })
      return { rows: [] }
    })

    await service.logout('temporary-session-token')

    assert.equal(queries.length, 1)
    assert.match(queries[0].sql, /update auth_sessions/i)
    assert.doesNotMatch(queries[0].sql, /email_verification_tokens/i)
    assert.doesNotMatch(queries[0].sql, /delete/i)
  })

  test('pending approvals query is DB-backed and independent of auth_sessions', async () => {
    const queries: RecordedQuery[] = []
    const service = createAuthService(async (sql, values) => {
      queries.push({ sql, values })
      return {
        rows: [
          {
            email: 'sort3@glitter.kr',
            requested_at: '2026-04-01T03:26:07.215Z',
          },
        ],
      }
    })

    const result = await service.listPendingApprovals()

    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].email, 'sort3@glitter.kr')
    assert.equal(result.items[0].lastSeenAt, '2026-04-01T03:26:07.215Z')
    assert.equal(queries.length, 1)
    assert.match(queries[0].sql, /from email_verification_tokens/i)
    assert.match(queries[0].sql, /left join approved_users/i)
    assert.doesNotMatch(queries[0].sql, /auth_sessions/i)
    assert.doesNotMatch(queries[0].sql, /session_type/i)
    assert.doesNotMatch(queries[0].sql, /revoked_at/i)
    assert.equal(queries[0].values, undefined)
  })



  test('getSession treats a temporary session as anonymous after password setup exists', async () => {
    const queries: RecordedQuery[] = []
    const service = createAuthService(async (sql, values) => {
      queries.push({ sql, values })

      if (/select s\.email, s\.session_type, s\.expires_at, s\.revoked_at, u\.is_super_admin, u\.password_hash\s+from auth_sessions s/i.test(sql)) {
        return {
          rows: [
            {
              email: 'first@glitter.kr',
              session_type: 'temporary',
              expires_at: '2099-01-01T00:00:00.000Z',
              revoked_at: null,
              is_super_admin: false,
              password_hash: 'stored-hash',
            },
          ],
        }
      }

      return { rows: [] }
    })

    const result = await service.getSession('temporary-session-token')

    assert.deepEqual(result, {
      authenticated: false,
      sessionType: null,
      activationRequired: false,
      email: null,
      isSuperAdmin: false,
    })
    assert.equal(queries.length, 1)
    assert.doesNotMatch(queries[0].sql, /update auth_sessions\s+set last_seen_at/i)
  })

  test('getSession treats an activation session as anonymous after password setup exists', async () => {
    const queries: RecordedQuery[] = []
    const service = createAuthService(async (sql, values) => {
      queries.push({ sql, values })

      if (/select s\.email, s\.session_type, s\.expires_at, s\.revoked_at, u\.is_super_admin, u\.password_hash\s+from auth_sessions s/i.test(sql)) {
        return {
          rows: [
            {
              email: 'first@glitter.kr',
              session_type: 'activation',
              expires_at: '2099-01-01T00:00:00.000Z',
              revoked_at: null,
              is_super_admin: false,
              password_hash: 'stored-hash',
            },
          ],
        }
      }

      return { rows: [] }
    })

    const result = await service.getSession('activation-session-token')

    assert.deepEqual(result, {
      authenticated: false,
      sessionType: null,
      activationRequired: false,
      email: null,
      isSuperAdmin: false,
    })
    assert.equal(queries.length, 1)
  })
  test('first-time access can bootstrap password setup from a verified access request', async () => {
    const delivered: Array<{ to: string; subject: string; text: string }> = []
    let step = 0
    const service = createAuthService(
      async (sql, values) => {
        step += 1

        if (step === 1) {
          assert.match(sql, /from approved_users/i)
          return { rows: [] }
        }

        if (step === 2) {
          assert.match(sql, /from email_verification_tokens/i)
          assert.match(sql, /purpose = 'access_request'/i)
          assert.deepEqual(values, ['first@glitter.kr'])
          return { rows: [{ email: 'first@glitter.kr' }] }
        }

        if (step === 3) {
          assert.match(sql, /insert into approved_users/i)
          return {
            rows: [
              {
                id: 'user-1',
                email: 'first@glitter.kr',
                password_hash: null,
              },
            ],
          }
        }

        if (step === 4) {
          assert.match(sql, /insert into email_verification_tokens/i)
          assert.deepEqual(values?.[0], 'first@glitter.kr')
          assert.deepEqual(values?.[4], 'password_reset')
          return { rows: [] }
        }

        throw new Error(`Unexpected query step ${step}`)
      },
      async (payload) => {
        delivered.push(payload)
      },
    )

    const result = await service.startPasswordReset({
      email: 'FIRST@glitter.kr',
      requestedIp: '127.0.0.1',
      requestedUserAgent: 'test-agent',
    })

    assert.equal(result.ok, true)
    assert.equal(result.email, 'first@glitter.kr')
    assert.equal(delivered.length, 1)
    assert.equal(delivered[0].to, 'first@glitter.kr')
    assert.equal(delivered[0].subject, 'GlitterAtlas Password Setup')
    assert.match(delivered[0].text, /create your password/i)
  })

  test('password setup bootstrap is rejected without a verified first access request', async () => {
    let step = 0
    const service = createAuthService(async (sql, values) => {
      step += 1

      if (step === 1) {
        assert.match(sql, /from approved_users/i)
        return { rows: [] }
      }

      if (step === 2) {
        assert.match(sql, /from email_verification_tokens/i)
        assert.deepEqual(values, ['missing@glitter.kr'])
        return { rows: [] }
      }

      throw new Error(`Unexpected query step ${step}`)
    })

    await assert.rejects(
      service.startPasswordReset({
        email: 'missing@glitter.kr',
        requestedIp: null,
        requestedUserAgent: null,
      }),
      /password setup is not available for this account/i,
    )
  })

  test('activateAccount revokes the activation session so first password setup does not keep the user signed in', async () => {
    const queries: RecordedQuery[] = []
    const service = createAuthService(
      async (sql) => {
        if (/select id, email, normalized_email, token_hash, purpose, expires_at, used_ats+from email_verification_tokens/i.test(sql)) {
          return {
            rows: [
              {
                id: 'token-1',
                email: 'first.kr',
                normalized_email: 'first.kr',
                token_hash: createHash('sha256').update('reset-token').digest('hex'),
                purpose: 'password_reset',
                expires_at: '2099-01-01T00:00:00.000Z',
                used_at: null,
              },
            ],
          }
        }

        return { rows: [] }
      },
      async () => undefined,
      async (sql, values) => {
        queries.push({ sql, values })

        if (/select id, email, normalized_email, approved_user_id, revoked_at, expires_at, session_type\s+from auth_sessions/i.test(sql)) {
          return {
            rows: [
              {
                id: 'session-1',
                email: 'first@glitter.kr',
                normalized_email: 'first@glitter.kr',
                approved_user_id: 'user-1',
                revoked_at: null,
                expires_at: '2099-01-01T00:00:00.000Z',
                session_type: 'activation',
              },
            ],
          }
        }

        if (/select id, email, password_hash\s+from approved_users/i.test(sql)) {
          return {
            rows: [
              {
                id: 'user-1',
                email: 'first@glitter.kr',
                password_hash: null,
              },
            ],
          }
        }

        return { rows: [] }
      },
    )

    const result = await service.activateAccount({
      sessionToken: 'activation-session-token',
      email: 'first@glitter.kr',
      password: 'strong-pass-123',
    })

    assert.equal(result.ok, true)
    assert.equal(result.email, 'first@glitter.kr')
    assert.match(queries[0].sql, /begin/i)
    assert.match(queries[1].sql, /from auth_sessions/i)
    assert.match(queries[2].sql, /from approved_users/i)
    assert.match(queries[3].sql, /update approved_users/i)
    assert.match(queries[4].sql, /update auth_sessions/i)
    assert.match(queries[4].sql, /set revoked_at = now\(\)/i)
    assert.doesNotMatch(queries[4].sql, /session_type = 'approved'/i)
    assert.match(queries[5].sql, /commit/i)
  })

  test('completePasswordReset revokes temporary and activation sessions so first-time setup returns to the login form', async () => {
    const queries: RecordedQuery[] = []
    const service = createAuthService(
      async (sql) => {
        if (/select id, email, normalized_email, token_hash, purpose, expires_at, used_at\s+from email_verification_tokens/i.test(sql)) {
          return {
            rows: [
              {
                id: 'token-1',
                email: 'first@glitter.kr',
                normalized_email: 'first@glitter.kr',
                token_hash: createHash('sha256').update('reset-token').digest('hex'),
                purpose: 'password_reset',
                expires_at: '2099-01-01T00:00:00.000Z',
                used_at: null,
              },
            ],
          }
        }

        return { rows: [] }
      },
      async () => undefined,
      async (sql, values) => {
        queries.push({ sql, values })


        if (/update email_verification_tokens\s+set used_at = now()/i.test(sql)) {
          return { rows: [{ id: 'token-1' }] }
        }
        if (/select id, email, normalized_email, token_hash, purpose, expires_at, used_at\s+from email_verification_tokens/i.test(sql)) {
          return {
            rows: [
              {
                id: 'token-1',
                email: 'first@glitter.kr',
                normalized_email: 'first@glitter.kr',
                token_hash: createHash('sha256').update('reset-token').digest('hex'),
                purpose: 'password_reset',
                expires_at: '2099-01-01T00:00:00.000Z',
                used_at: null,
              },
            ],
          }
        }

        if (/select id, email, password_hash\s+from approved_users/i.test(sql)) {
          return {
            rows: [
              {
                id: 'user-1',
                email: 'first@glitter.kr',
                password_hash: null,
              },
            ],
          }
        }

        return { rows: [] }
      },
    )

    const result = await service.completePasswordReset({
      selector: 'selector-1',
      token: 'reset-token',
      email: 'first@glitter.kr',
      password: 'strong-pass-123',
    })

    assert.equal(result.ok, true)
    assert.equal(result.email, 'first@glitter.kr')
    assert.match(queries[0].sql, /begin/i)
    assert.match(queries[1].sql, /update email_verification_tokens/i)
    assert.match(queries[2].sql, /from approved_users/i)
    assert.match(queries[3].sql, /update approved_users/i)
    assert.match(queries[4].sql, /update auth_sessions/i)
    assert.match(queries[4].sql, /normalized_email = \$1/i)
    assert.match(queries[4].sql, /session_type in \('temporary', 'activation'\)/i)
    assert.match(queries[4].sql, /revoked_at = now\(\)/i)
    assert.deepEqual(queries[4].values, ['first@glitter.kr'])
    assert.match(queries[5].sql, /delete from email_verification_tokens/i)
    assert.match(queries[6].sql, /commit/i)
  })

  test('listMembersDirectory returns approved_users in the confirmed schema column order and masks password hashes', async () => {
    const service = createAuthService(async (sql) => {
      assert.match(sql, /select id, email, normalized_email, is_active, created_at, updated_at, password_hash, is_super_admin/i)
      return {
        rows: [
          {
            id: 2,
            email: 'member@glitter.kr',
            normalized_email: 'member@glitter.kr',
            is_active: true,
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-02T00:00:00.000Z',
            password_hash: 'secret-hash',
            is_super_admin: false,
          },
        ],
      }
    })

    const result = await service.listMembersDirectory()

    assert.equal(result.tableName, 'approved_users')
    assert.equal(result.primaryKey, 'id')
    assert.deepEqual(result.columnOrder, [
      'id',
      'email',
      'normalized_email',
      'is_active',
      'created_at',
      'updated_at',
      'password_hash',
      'is_super_admin',
    ])
    assert.deepEqual(result.maskedColumns, ['password_hash'])
    assert.equal(result.items[0].password_hash, '[stored]')
    assert.equal(result.items[0].isProtected, false)
  })

  test('removeMember soft deletes by id and revokes approved sessions', async () => {
    const queries: RecordedQuery[] = []
    const transactionQueries: RecordedQuery[] = []
    const service = createAuthService(
      async (sql, values) => {
        queries.push({ sql, values })

        if (/select id, normalized_email, is_active, is_super_admin\s+from approved_users/i.test(sql)) {
          return {
            rows: [
              {
                id: 2,
                normalized_email: 'member@glitter.kr',
                is_active: true,
                is_super_admin: false,
              },
            ],
          }
        }

        return { rows: [] }
      },
      async () => undefined,
      async (sql, values) => {
        transactionQueries.push({ sql, values })
        return { rows: [] }
      },
    )

    const result = await service.removeMember({ id: 2 })

    assert.equal(result.ok, true)
    assert.equal(result.id, 2)
    assert.equal(result.deleteMode, 'soft_delete')
    assert.match(queries[0].sql, /select id, normalized_email, is_active, is_super_admin/i)
    assert.match(transactionQueries[0].sql, /begin/i)
    assert.match(transactionQueries[1].sql, /update approved_users/i)
    assert.match(transactionQueries[1].sql, /set is_active = false/i)
    assert.doesNotMatch(transactionQueries[1].sql, /delete from approved_users/i)
    assert.deepEqual(transactionQueries[1].values, [2])
    assert.match(transactionQueries[2].sql, /update auth_sessions/i)
    assert.deepEqual(transactionQueries[2].values, [2])
    assert.match(transactionQueries[3].sql, /commit/i)
  })

  test('removeMember protects the super admin member record', async () => {
    const service = createAuthService(async (sql) => {
      if (/select id, normalized_email, is_active, is_super_admin\s+from approved_users/i.test(sql)) {
        return {
          rows: [
            {
              id: 1,
              normalized_email: 'gim@glitter.kr',
              is_active: true,
              is_super_admin: true,
            },
          ],
        }
      }

      return { rows: [] }
    })

    await assert.rejects(
      service.removeMember({ id: 1 }),
      /super admin members cannot be removed/i,
    )
  })


  test('startEmail rejects addresses that fail the receivability preflight', async () => {
    const queries: RecordedQuery[] = []
    const delivered: Array<{ to: string; subject: string; text: string; html?: string }> = []
    const service = createAuthService(
      async (sql, values) => {
        queries.push({ sql, values })
        return { rows: [] }
      },
      async (payload) => {
        delivered.push(payload)
      },
    )

    const serviceWithResolver = service as unknown as {
      resolveMxRecords: (domain: string) => Promise<Array<{ exchange: string; priority: number }>>
    }

    serviceWithResolver.resolveMxRecords = async () => {
      const error = new Error('domain not found') as Error & { code: string }
      error.code = 'ENOTFOUND'
      throw error
    }

    await assert.rejects(
      service.startEmail({
        email: 'user@example.invalid',
        requestedIp: '127.0.0.1',
        requestedUserAgent: 'test-agent',
      }),
      (error: unknown) => (
        error instanceof BadRequestException &&
        error.message === 'This email address may not be able to receive mail. Please verify the address and try again.'
      ),
    )

    assert.equal(queries.length, 0)
    assert.equal(delivered.length, 0)
  })

  test('startEmail continues existing mail flow when receivability preflight passes', async () => {
    const delivered: Array<{ to: string; subject: string; text: string; html?: string }> = []
    let step = 0
    const service = createAuthService(
      async (sql, values) => {
        step += 1

        if (step === 1) {
          assert.match(sql, /from approved_users/i)
          assert.deepEqual(values, ['person@glitter.kr'])
          return { rows: [] }
        }

        if (step === 2) {
          assert.match(sql, /insert into email_verification_tokens/i)
          assert.deepEqual(values?.[0], 'person@glitter.kr')
          assert.deepEqual(values?.[4], 'login')
          return { rows: [] }
        }

        throw new Error(`Unexpected query step ${step}`)
      },
      async (payload) => {
        delivered.push(payload)
      },
    )

    const serviceWithResolver = service as unknown as {
      resolveMxRecords: (domain: string) => Promise<Array<{ exchange: string; priority: number }>>
    }

    serviceWithResolver.resolveMxRecords = async () => [
      { exchange: 'mx.glitter.kr', priority: 10 },
    ]

    const result = await service.startEmail({
      email: 'person@glitter.kr',
      requestedIp: '127.0.0.1',
      requestedUserAgent: 'test-agent',
    })

    assert.equal(result.ok, true)
    assert.equal(delivered.length, 1)
    assert.equal(delivered[0].to, 'person@glitter.kr')
    assert.equal(delivered[0].subject, 'GlitterAtlas Sign-In Link')
  })
})

function createAuthService(
  queryImpl: (sql: string, values?: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
  sendMailImpl: (payload: { to: string; subject: string; text: string; html?: string }) => Promise<void> = async () => undefined,
  connectQueryImpl?: (sql: string, values?: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
) {
  const transactionQuery = connectQueryImpl ?? queryImpl

  return new AuthService(
    {
      getOrThrow(key: string) {
        if (key === 'APP_BASE_URL') {
          return 'https://atlas.glitter.kr'
        }
        throw new Error(`Unexpected config key: ${key}`)
      },
    } as never,
    {
      pool: {
        query: queryImpl,
        connect: async () => ({
          query: transactionQuery,
          release() {},
        }),
      },
    } as never,
    {
      sendMail: sendMailImpl,
    } as never,
  )
}
