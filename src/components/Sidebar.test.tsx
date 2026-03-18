// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureGraph } from '../test/fixtureGraph'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('falls back to graph-derived poems when the poem asset request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
      })),
    )

    render(<Sidebar graph={fixtureGraph} onClose={() => undefined} selectedId="白居易" />)

    expect(await screen.findByText('诗作文件加载失败，已回退到图谱内嵌摘要。')).toBeInTheDocument()
    expect(screen.getByText('酬乐天频梦微之')).toBeInTheDocument()
    expect(screen.getByText('梦微之')).toBeInTheDocument()
  })
})
