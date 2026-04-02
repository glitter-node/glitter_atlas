import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  renderActivationLinkEmail,
  renderPasswordActionEmail,
  renderVerificationEmail,
  renderTransactionalEmail,
} from './transactional-email'

describe('transactional email renderer', () => {
  test('renders a production-style HTML card with button and fallback link', () => {
    const html = renderTransactionalEmail({
      brand: 'GlitterAtlas',
      title: 'Verify your email',
      description: 'Use the button below to verify your email address.',
      buttonText: 'Verify Email',
      actionUrl: 'https://atlas.glitter.kr/auth/verify?selector=abc&token=def',
      expiryNotice: 'This verification link expires in 15 minutes.',
      oneTimeUseNotice: 'This link can only be used once.',
      footer: 'If you did not request this email, you can safely ignore it.',
    })

    assert.match(html, /<table role="presentation"/i)
    assert.match(html, /max-width:600px/i)
    assert.match(html, />\s*GlitterAtlas\s*</)
    assert.match(html, /<a href="https:\/\/atlas\.glitter\.kr\/auth\/verify\?selector=abc&amp;token=def"[^>]*>\s*Verify Email\s*<\/a>/i)
    assert.match(html, /If the button does not work, copy and paste this link into your browser:/)
    assert.match(html, /This verification link expires in 15 minutes\./)
    assert.match(html, /This link can only be used once\./)
    assert.match(html, /This is an automated message\. Please do not reply to this email\./)
  })

  test('renders verification email with html primary and plain-text fallback content', () => {
    const rendered = renderVerificationEmail({
      actionUrl: 'https://atlas.glitter.kr/auth/verify?selector=abc&token=def',
      expiresInMinutes: 15,
    })

    assert.match(rendered.html, /Verify your email/)
    assert.match(rendered.html, /<a href="https:\/\/atlas\.glitter\.kr\/auth\/verify\?selector=abc&amp;token=def"/i)
    assert.match(rendered.text, /https:\/\/atlas\.glitter\.kr\/auth\/verify\?selector=abc&token=def/)
    assert.match(rendered.text, /This verification link expires in 15 minutes\./)
    assert.match(rendered.text, /This link can only be used once\./)
  })

  test('renders activation email with the shared card layout and activation-specific copy', () => {
    const rendered = renderActivationLinkEmail({
      actionUrl: 'https://atlas.glitter.kr/auth/complete?selector=abc&token=def',
      expiresInMinutes: 15,
    })

    assert.match(rendered.html, /Activate your archive access/)
    assert.match(rendered.html, /Continue Activation/)
    assert.match(rendered.html, /This activation link expires in 15 minutes\./)
    assert.match(rendered.html, /If the button does not work, copy and paste this link into your browser:/)
    assert.match(rendered.text, /Open this activation link to continue:/)
    assert.match(rendered.text, /This link can only be used once\./)
  })

  test('renders password setup email with the shared card layout and setup-specific copy', () => {
    const rendered = renderPasswordActionEmail({
      actionUrl: 'https://atlas.glitter.kr/auth/reset-password?selector=abc&token=def',
      expiresInMinutes: 15,
      mode: 'setup',
    })

    assert.match(rendered.html, /<table role="presentation"/i)
    assert.match(rendered.html, /max-width:600px/i)
    assert.match(rendered.html, />\s*GlitterAtlas\s*</)
    assert.match(rendered.html, /Create your password/)
    assert.match(rendered.html, /Use the button below to create your password\./)
    assert.match(rendered.html, /<a href="https:\/\/atlas\.glitter\.kr\/auth\/reset-password\?selector=abc&amp;token=def"[^>]*>\s*Create Password\s*<\/a>/i)
    assert.match(rendered.html, /If the button does not work, copy and paste this link into your browser:/)
    assert.match(rendered.html, /https:\/\/atlas\.glitter\.kr\/auth\/reset-password\?selector=abc&amp;token=def/)
    assert.match(rendered.html, /This password setup link expires in 15 minutes\./)
    assert.match(rendered.html, /This link can only be used once\./)
    assert.match(rendered.text, /Open this link to create your password:/)
    assert.match(rendered.text, /https:\/\/atlas\.glitter\.kr\/auth\/reset-password\?selector=abc&token=def/)
    assert.match(rendered.text, /This password setup link expires in 15 minutes\./)
    assert.match(rendered.text, /This link can only be used once\./)
  })

  test('renders password reset email with the shared card layout and reset-specific copy', () => {
    const rendered = renderPasswordActionEmail({
      actionUrl: 'https://atlas.glitter.kr/auth/reset-password?selector=abc&token=def',
      expiresInMinutes: 15,
      mode: 'reset',
    })

    assert.match(rendered.html, /Reset your archive password/)
    assert.match(rendered.html, /Reset Password/)
    assert.match(rendered.html, /This password reset link expires in 15 minutes\./)
    assert.match(rendered.text, /Open this link to reset your password:/)
    assert.match(rendered.text, /This link can only be used once\./)
  })

})
