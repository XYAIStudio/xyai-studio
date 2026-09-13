// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ModelPlaza, type PlazaCall } from '../src/client/plaza.ts'
import { en } from '../src/client/locales.ts'
import { defaultModelHub } from '../src/models.ts'

afterEach(cleanup)
const t = (key: keyof typeof en): string => en[key]

it('exposes Ollama pull on the local tab and never offers a re-download button', async () => {
  const call = vi.fn(async (endpoint: string) => {
    if (endpoint === 'environment/inspect') return { errcode: '0', runtime: { gguf: 'missing', ollama: 'running' } }
    if (endpoint === 'recommend/list') return { errcode: '0', models: [] }
    if (endpoint === 'registry/list') return { errcode: '0', entries: [] }
    if (endpoint === 'cloud/providers') return { errcode: '0', providers: [] }
    if (endpoint === 'downloads/list') return { errcode: '0', tasks: [] }
    if (endpoint === 'ollama/pull') return { errcode: '0', task: { taskId: 't1', kind: 'download', label: 'tinyllama:1.1b', phase: 'connecting', percent: 2, stub: false } }
    return { errcode: '0' }
  }) as unknown as PlazaCall
  render(<ModelPlaza call={call} t={t} hub={defaultModelHub} />)
  fireEvent.click(await screen.findByText('My models'))
  expect(screen.getByLabelText('Ollama model name')).toBeTruthy()
  expect(screen.getAllByText('Ollama pull').length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: /re-download/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /重新下载/ })).toBeNull()
  fireEvent.change(screen.getByLabelText('Ollama model name'), { target: { value: 'tinyllama:1.1b' } })
  fireEvent.click(screen.getAllByText('Ollama pull').at(-1)!)
  await waitFor(() => expect(call).toHaveBeenCalledWith('ollama/pull', { tag: 'tinyllama:1.1b' }))
})

it('keeps cloud API key + speed test on the cloud tab', async () => {
  const call = vi.fn(async (endpoint: string) => {
    if (endpoint === 'environment/inspect') return { errcode: '0', runtime: { gguf: 'missing', ollama: 'missing' } }
    if (endpoint === 'recommend/list') return { errcode: '0', models: [] }
    if (endpoint === 'registry/list') return { errcode: '0', entries: [] }
    if (endpoint === 'downloads/list') return { errcode: '0', tasks: [] }
    if (endpoint === 'cloud/providers') {
      return { errcode: '0', providers: [{ id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com', keyConfigured: true, models: [{ id: 'v4', name: 'V4', call: 'chat' }] }] }
    }
    if (endpoint === 'cloud/test') return { errcode: '0', result: 'HTTP 200' }
    return { errcode: '0' }
  }) as unknown as PlazaCall
  render(<ModelPlaza call={call} t={t} hub={defaultModelHub} />)
  fireEvent.click(await screen.findByText('Cloud'))
  expect(screen.getByText('API Key')).toBeTruthy()
  fireEvent.click(screen.getByText('Test connection'))
  await waitFor(() => expect(call).toHaveBeenCalledWith('cloud/test', expect.objectContaining({ providerId: 'deepseek' })))
})
