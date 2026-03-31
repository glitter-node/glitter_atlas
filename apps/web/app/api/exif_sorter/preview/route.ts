import { buildPreviewItems } from '../../../../../../lib/import/preview'
import { getConfiguredPath } from '../env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_request: Request) {
  try {
    const configuredPath = getConfiguredPath('IMG_EXPORT_DATA')

    if (!configuredPath.ok) {
      return Response.json(
        {
          ok: false,
          error: configuredPath.error,
        },
        { status: 500 },
      )
    }

    const items = await buildPreviewItems(configuredPath.value)
    const truncated = items.length > 1000
    const limitedItems = truncated ? items.slice(0, 1000) : items

    return Response.json({
      ok: true,
      count: limitedItems.length,
      truncated,
      items: limitedItems,
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
