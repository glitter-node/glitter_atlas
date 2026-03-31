import { applyPreviewItems } from '../../../../../../lib/apply/runner'
import type { ApplyMode } from '../../../../../../lib/apply/types'
import type { PreviewItem } from '../../../../../../lib/import/types'
import { getConfiguredPath } from '../env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      items?: unknown
      mode?: unknown
    }

    if (!Array.isArray(body.items)) {
      return Response.json(
        {
          ok: false,
          error: 'items must be an array',
        },
        { status: 400 },
      )
    }

    if (body.items.length === 0 || body.items.length > 5000) {
      return Response.json(
        {
          ok: false,
          error: 'items must contain between 1 and 5000 entries',
        },
        { status: 400 },
      )
    }

    const configuredPath = getConfiguredPath('IMG_EXPORT_TARGET')

    if (!configuredPath.ok) {
      return Response.json(
        {
          ok: false,
          error: configuredPath.error,
        },
        { status: 500 },
      )
    }

    if (body.mode !== 'copy' && body.mode !== 'move') {
      return Response.json(
        {
          ok: false,
          error: 'mode must be copy or move',
        },
        { status: 400 },
      )
    }

    const results = await applyPreviewItems(
      body.items as PreviewItem[],
      configuredPath.value,
      body.mode as ApplyMode,
    )

    return Response.json({
      ok: true,
      count: results.length,
      results,
    })
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'internal server error',
      },
      { status: 500 },
    )
  }
}
