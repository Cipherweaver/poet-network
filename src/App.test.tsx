// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { buildFallbackPoems } from './lib/poems'
import { fixtureGraph } from './test/fixtureGraph'

vi.mock('./components/PoetScene', () => ({
  PoetScene: ({ onSelect }: { onSelect: (poetId: string) => void }) => (
    <button onClick={() => onSelect('白居易')} type="button">
      选择白居易
    </button>
  ),
}))

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows an error state when graph loading fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
      })),
    )

    render(<App />)

    expect(await screen.findByText('图谱数据加载失败，请刷新后重试。')).toBeInTheDocument()
  })

  it('loads the graph and keeps the sidebar open when Escape closes the poem modal', async () => {
    const poems = buildFallbackPoems(fixtureGraph, '白居易')

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.endsWith('/graph.json')) {
          return {
            json: async () => fixtureGraph,
            ok: true,
          }
        }

        if (url.includes('/poems/%E7%99%BD%E5%B1%85%E6%98%93.json')) {
          return {
            json: async () => poems,
            ok: true,
          }
        }

        return {
          ok: false,
        }
      }),
    )

    render(<App />)

    await waitFor(() => expect(screen.getByRole('searchbox')).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: '选择白居易' }))

    expect(await screen.findByRole('heading', { name: '白居易' })).toBeInTheDocument()

    fireEvent.click(screen.getByText('酬乐天频梦微之').closest('button')!)
    expect(await screen.findByLabelText('酬乐天频梦微之')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByLabelText('酬乐天频梦微之')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: '白居易' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: '白居易' })).not.toBeInTheDocument()
    })
  })
})
