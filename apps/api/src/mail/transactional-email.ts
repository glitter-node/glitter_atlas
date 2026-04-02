export type AuthEmailTemplateInput = {
  brand: string
  title: string
  description: string
  buttonText: string
  actionUrl: string
  expiryNotice: string
  oneTimeUseNotice: string
  footer: string
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderAuthEmailTemplate(input: AuthEmailTemplateInput) {
  const brand = escapeHtml(input.brand)
  const title = escapeHtml(input.title)
  const description = escapeHtml(input.description)
  const buttonText = escapeHtml(input.buttonText)
  const actionUrl = escapeHtml(input.actionUrl)
  const expiryNotice = escapeHtml(input.expiryNotice)
  const oneTimeUseNotice = escapeHtml(input.oneTimeUseNotice)
  const footer = escapeHtml(input.footer)

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f3f4f6; font-family:Arial, Helvetica, sans-serif; color:#111111;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; width:100%; background-color:#f3f4f6;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; width:100%; max-width:600px;">
            <tr>
              <td style="padding:0 0 16px 0; text-align:center; font-family:Arial, Helvetica, sans-serif; font-size:20px; line-height:28px; font-weight:bold; color:#111111;">
                ${brand}
              </td>
            </tr>
            <tr>
              <td style="background-color:#ffffff; border:1px solid #e5e7eb; border-radius:8px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; width:100%;">
                  <tr>
                    <td style="padding:36px 40px 16px 40px; text-align:center; font-family:Arial, Helvetica, sans-serif; font-size:30px; line-height:38px; font-weight:bold; color:#111111;">
                      ${title}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 40px 28px 40px; text-align:center; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#4b5563;">
                      ${description}
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding:0 40px 28px 40px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                        <tr>
                          <td align="center" bgcolor="#111111" style="background-color:#111111; border-radius:6px;">
                            <a href="${actionUrl}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:20px; font-weight:bold; color:#ffffff; text-decoration:none; background-color:#111111; border:1px solid #111111; border-radius:6px;">
                              ${buttonText}
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 40px 12px 40px; text-align:center; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#6b7280;">
                      If the button does not work, copy and paste this link into your browser:
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 40px 28px 40px; text-align:center; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#2563eb; word-break:break-all;">
                      <a href="${actionUrl}" target="_blank" style="color:#2563eb; text-decoration:underline;">${actionUrl}</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 24px 28px 24px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; width:100%; background-color:#f9fafb; border:1px solid #e5e7eb; border-radius:6px;">
                        <tr>
                          <td style="padding:16px 20px 8px 20px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#111111; font-weight:bold;">
                            Important
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:0 20px 6px 20px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#4b5563;">
                            ${expiryNotice}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:0 20px 16px 20px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#4b5563;">
                            ${oneTimeUseNotice}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 40px 36px 40px; text-align:center; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#6b7280;">
                      ${footer}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px 0 20px; text-align:center; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; color:#9ca3af;">
                This is an automated message. Please do not reply to this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}


export function renderActivationLinkEmail(input: {
  actionUrl: string
  expiresInMinutes: number
}) {
  const expiryNotice = `This activation link expires in ${input.expiresInMinutes} minutes.`
  const oneTimeUseNotice = 'This link can only be used once.'
  return {
    html: renderAuthEmailTemplate({
      brand: 'GlitterAtlas',
      title: 'Activate your archive access',
      description:
        'Use the button below to continue activation and return to the archive access flow.',
      buttonText: 'Continue Activation',
      actionUrl: input.actionUrl,
      expiryNotice,
      oneTimeUseNotice,
      footer: 'If you did not request this email, you can safely ignore it.',
    }),
    text:
      `Activate your archive access

` +
      `Open this activation link to continue:

${input.actionUrl}

` +
      `${expiryNotice}
${oneTimeUseNotice}

` +
      'If you did not request this email, you can safely ignore it.',
  }
}

export { renderAuthEmailTemplate as renderTransactionalEmail }

export function renderPasswordActionEmail(input: {
  actionUrl: string
  expiresInMinutes: number
  mode: 'setup' | 'reset'
}) {
  const isSetup = input.mode === 'setup'
  const expiryNotice = `This ${isSetup ? 'password setup' : 'password reset'} link expires in ${input.expiresInMinutes} minutes.`
  const oneTimeUseNotice = 'This link can only be used once.'
  return {
    html: renderAuthEmailTemplate({
      brand: 'GlitterAtlas',
      title: isSetup ? 'Create your password' : 'Reset your archive password',
      description: isSetup
        ? 'Use the button below to create your password.'
        : 'Use the button below to reset your password and return to archive access.',
      buttonText: isSetup ? 'Create Password' : 'Reset Password',
      actionUrl: input.actionUrl,
      expiryNotice,
      oneTimeUseNotice,
      footer: 'If you did not request this email, you can safely ignore it.',
    }),
    text:
      `${isSetup ? 'Create your password' : 'Reset your archive password'}

` +
      `${isSetup ? 'Open this link to create your password' : 'Open this link to reset your password'}:

${input.actionUrl}

` +
      `${expiryNotice}
${oneTimeUseNotice}

` +
      'If you did not request this email, you can safely ignore it.',
  }
}

export function renderVerificationEmail(input: {
  actionUrl: string
  expiresInMinutes: number
}) {
  const expiryNotice = `This verification link expires in ${input.expiresInMinutes} minutes.`
  const oneTimeUseNotice = 'This link can only be used once.'
  return {
    html: renderAuthEmailTemplate({
      brand: 'GlitterAtlas',
      title: 'Verify your email',
      description:
        'Use the button below to verify your email address.',
      buttonText: 'Verify Email',
      actionUrl: input.actionUrl,
      expiryNotice,
      oneTimeUseNotice,
      footer: 'If you did not request this email, you can safely ignore it.',
    }),
    text:
      `Verify your email\n\n` +
      `Open this verification link to verify your email:\n\n${input.actionUrl}\n\n` +
      `${expiryNotice}\n${oneTimeUseNotice}\n\n` +
      'If you did not request this email, you can safely ignore it.',
  }
}
