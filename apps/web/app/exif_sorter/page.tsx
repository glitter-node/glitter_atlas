'use client'

import { useState } from 'react'
import styles from './exif_sorter.module.css'

type PreviewItem = {
  filePath: string
  decision: {
    strategy: string
    targetDir: string
    confidence: number
  }
}

type PreviewResponse = {
  ok: boolean
  count?: number
  items?: PreviewItem[]
  error?: string
}

type ApplyItemResult = {
  sourcePath: string
  destinationPath: string | null
  status: string
  error: string | null
}

type ApplyResponse = {
  ok: boolean
  count?: number
  results?: ApplyItemResult[]
  error?: string
}

export default function ExifSorterPage() {
  const [inputDir, setInputDir] = useState('')
  const [targetRoot, setTargetRoot] = useState('')
  const [mode, setMode] = useState<'copy' | 'move'>('copy')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [loadingApply, setLoadingApply] = useState(false)
  const [previewResponse, setPreviewResponse] = useState<PreviewResponse | null>(null)
  const [applyResponse, setApplyResponse] = useState<ApplyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const previewItems = Array.isArray(previewResponse?.items) ? previewResponse.items : []
  const applyItems = Array.isArray(applyResponse?.results) ? applyResponse.results : []

  async function handlePreview() {
    setLoadingPreview(true)
    setError(null)
    setApplyResponse(null)

    try {
      const response = await fetch('/api/exif_sorter/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputDir }),
      })

      const data = (await response.json()) as PreviewResponse

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Preview request failed')
      }

      setPreviewResponse(data)
    } catch (caughtError) {
      setPreviewResponse(null)
      setError(caughtError instanceof Error ? caughtError.message : 'Preview request failed')
    } finally {
      setLoadingPreview(false)
    }
  }

  async function handleApply() {
    if (!previewItems.length) {
      return
    }

    setLoadingApply(true)
    setError(null)

    try {
      const response = await fetch('/api/exif_sorter/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: previewItems,
          targetRoot,
          mode,
        }),
      })

      const data = (await response.json()) as ApplyResponse

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Apply request failed')
      }

      setApplyResponse(data)
    } catch (caughtError) {
      setApplyResponse(null)
      setError(caughtError instanceof Error ? caughtError.message : 'Apply request failed')
    } finally {
      setLoadingApply(false)
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>EXIF Sorter Test</h1>
        <p>Run preview and apply operations against the internal EXIF sorter routes.</p>
      </header>

      <section className={styles.section}>
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="inputDir">
              Input directory
            </label>
            <input
              id="inputDir"
              className={styles.input}
              type="text"
              value={inputDir}
              onChange={(event) => setInputDir(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="targetRoot">
              Target root
            </label>
            <input
              id="targetRoot"
              className={styles.input}
              type="text"
              value={targetRoot}
              onChange={(event) => setTargetRoot(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="mode">
              Mode
            </label>
            <select
              id="mode"
              className={styles.select}
              value={mode}
              onChange={(event) => setMode(event.target.value as 'copy' | 'move')}
            >
              <option value="copy">copy</option>
              <option value="move">move</option>
            </select>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.button}
              type="button"
              onClick={handlePreview}
              disabled={loadingPreview}
            >
              {loadingPreview ? 'Previewing...' : 'Preview'}
            </button>
            <button
              className={`${styles.button} ${styles.buttonSecondary}`}
              type="button"
              onClick={handleApply}
              disabled={loadingApply || previewItems.length === 0}
            >
              {loadingApply ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <section className={styles.error}>
          <strong>Error</strong>
          <span>{error}</span>
        </section>
      ) : null}

      {previewResponse ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Preview</h2>
          <div className={styles.summary}>
            <div>
              <span className={styles.key}>ok</span>
              <span className={styles.value}>{String(previewResponse.ok)}</span>
            </div>
            <div>
              <span className={styles.key}>count</span>
              <span className={styles.value}>{String(previewResponse.count ?? 0)}</span>
            </div>
          </div>
          <div className={styles.list}>
            {previewItems.slice(0, 20).map((item) => (
              <article className={styles.card} key={item.filePath}>
                <div>
                  <span className={styles.key}>filePath</span>
                  <div className={`${styles.value} ${styles.mono}`}>{item.filePath}</div>
                </div>
                <div>
                  <span className={styles.key}>strategy</span>
                  <div className={styles.value}>{item.decision.strategy}</div>
                </div>
                <div>
                  <span className={styles.key}>targetDir</span>
                  <div className={`${styles.value} ${styles.mono}`}>{item.decision.targetDir}</div>
                </div>
                <div>
                  <span className={styles.key}>confidence</span>
                  <div className={styles.value}>{String(item.decision.confidence)}</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {applyResponse ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Apply</h2>
          <div className={styles.summary}>
            <div>
              <span className={styles.key}>ok</span>
              <span className={styles.value}>{String(applyResponse.ok)}</span>
            </div>
            <div>
              <span className={styles.key}>count</span>
              <span className={styles.value}>{String(applyResponse.count ?? 0)}</span>
            </div>
          </div>
          <div className={styles.list}>
            {applyItems.slice(0, 20).map((item, index) => (
              <article
                className={styles.card}
                key={`${item.sourcePath}-${item.destinationPath ?? 'null'}-${index}`}
              >
                <div>
                  <span className={styles.key}>sourcePath</span>
                  <div className={`${styles.value} ${styles.mono}`}>{item.sourcePath}</div>
                </div>
                <div>
                  <span className={styles.key}>destinationPath</span>
                  <div className={`${styles.value} ${styles.mono}`}>{item.destinationPath ?? 'null'}</div>
                </div>
                <div>
                  <span className={styles.key}>status</span>
                  <div className={styles.value}>{item.status}</div>
                </div>
                <div>
                  <span className={styles.key}>error</span>
                  <div className={styles.value}>{item.error ?? 'null'}</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
