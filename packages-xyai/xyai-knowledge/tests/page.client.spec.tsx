// @vitest-environment happy-dom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { KnowledgePage, type Call, type DirectoryListing } from '../src/client/page.tsx'
import { zh } from '../src/client/locales.ts'
import type { CloudMount, LocalMount, Snapshot } from '../src/protocol.ts'

afterEach(cleanup)
const t = (key: keyof typeof zh): string => zh[key]
const empty: Snapshot = { mounts: [], busy: null, processed: 0, error: null, artifactRoot: 'C:/Users/me/.dsh/xyai-studio/knowledge/v1' }
const listing: DirectoryListing = { path: 'D:/资料', home: 'D:/', crumbs: [], entries: [{ name: '子目录', path: 'D:/资料/子目录', hidden: false }], truncated: false }

it('guides local folder selection through precheck, application output and model plan', async () => {
  const call = vi.fn(async endpoint => endpoint === 'snapshot' ? empty : endpoint === 'precheck' ? { root: 'D:/资料', existing: null } : endpoint === 'mountLocal' ? ({ kind:'local', id:'local-1', name:'资料', root:'D:/资料', output:empty.artifactRoot+'/local-1', documents:[] } satisfies LocalMount) : null) as unknown as Call
  const listDirectory = vi.fn(async () => listing)
  render(<KnowledgePage call={call} t={t} listDirectory={listDirectory}/>)
  fireEvent.click(screen.getByText('挂接本地文件夹')); fireEvent.click(screen.getByText('浏览…')); fireEvent.click(await screen.findByText('选择当前文件夹'))
  fireEvent.click(screen.getByText('检查文件夹')); await screen.findByText(/原始文件及目录不会被改动/)
  expect(screen.getByText(new RegExp(empty.artifactRoot.replaceAll('/','\\/')))).toBeTruthy(); expect(screen.getByText(/实测已安装的 Ollama 模型/)).toBeTruthy()
  fireEvent.click(screen.getByText('挂接并开始处理')); await waitFor(()=>expect(call).toHaveBeenCalledWith('mountLocal',{path:'D:/资料'})); expect(call).toHaveBeenCalledWith('scan',{id:'local-1'})
})

it('tests ima credentials, lists visible libraries, mounts metadata and exposes no parse action', async () => {
  const cloud: CloudMount = { kind:'ima', id:'ima-1', name:'研发资料', knowledgeBaseId:'kb-1', documents:[{id:'media-1',title:'规范.pdf',directory:false}] }
  let snapshot = empty
  const call = vi.fn(async (endpoint:string) => endpoint==='snapshot' ? snapshot : endpoint==='imaTest' ? [{id:'kb-1',name:'研发资料'}] : endpoint==='mountIma' ? (snapshot={...empty,mounts:[cloud]},cloud) : null) as unknown as Call
  render(<KnowledgePage call={call} t={t} listDirectory={vi.fn()}/>)
  fireEvent.click(screen.getByText('连接云知识库')); fireEvent.change(screen.getByLabelText('Client ID'),{target:{value:'client'}}); fireEvent.change(screen.getByLabelText('API Key'),{target:{value:'secret'}}); fireEvent.click(screen.getByText('测试连接'))
  await screen.findByText(/连接成功/); fireEvent.click(screen.getByText('完成挂接')); await waitFor(()=>expect(call).toHaveBeenCalledWith('mountIma',expect.objectContaining({knowledgeBaseId:'kb-1'})))
  expect(await screen.findByText(/这里只显示云端元数据/)).toBeTruthy(); expect(screen.getByText(/规范\.pdf/)).toBeTruthy(); expect(screen.queryByText('重新扫描并蒸馏')).toBeNull()
})

it('browses ima folders through Host metadata calls without exposing parsing actions', async () => {
  const cloud: CloudMount = { kind:'ima', id:'ima-1', name:'热电知识蒸馏', knowledgeBaseId:'kb-1', documents:[{id:'folder-1',title:'热电目录',directory:true}] }
  const snapshot: Snapshot = {...empty,mounts:[cloud]}
  const call = vi.fn(async (endpoint:string) => endpoint === 'snapshot' ? snapshot : endpoint === 'cloudList' ? [{id:'media-1',title:'运行规程.pdf',parentId:'folder-1',directory:false}] : null) as unknown as Call
  render(<KnowledgePage call={call} t={t} listDirectory={vi.fn()}/>)
  fireEvent.click(await screen.findByText('热电知识蒸馏')); fireEvent.click(screen.getByText(/热电目录/))
  expect(await screen.findByText(/运行规程.pdf/)).toBeTruthy(); expect(call).toHaveBeenCalledWith('cloudList',{id:'ima-1',folderId:'folder-1'}); expect(screen.getByText(/知识库根目录 \/ 热电目录/)).toBeTruthy(); expect(screen.queryByText('重新扫描并蒸馏')).toBeNull()
})

it('previews local artifacts and confirms detach without deleting data', async () => {
  const local: LocalMount = { kind:'local', id:'local-1', name:'资料', root:'D:/资料', output:'C:/app/local-1', documents:[{id:'doc-1',path:'manual.md',size:10,modified:1,state:'ready',characters:4,model:'fast:1b'}], selectedModel:{name:'fast:1b',measuredAt:'now',tokensPerSecond:80,durationMs:20} }
  const snapshot: Snapshot = {...empty,mounts:[local]}; const call=vi.fn(async(endpoint:string)=>endpoint==='snapshot'?snapshot:endpoint==='preview'?'真实解析文本':null) as unknown as Call
  render(<KnowledgePage call={call} t={t} listDirectory={vi.fn()}/>); fireEvent.click(await screen.findByText('资料')); fireEvent.click(screen.getByText('抽取文本')); expect(await screen.findByText('真实解析文本')).toBeTruthy()
  fireEvent.click(screen.getByText('解除挂接')); expect(screen.getByRole('dialog')).toBeTruthy(); expect(screen.getByText(/应用解析产物均保留/)).toBeTruthy(); fireEvent.click(screen.getByText('取消')); expect(call).not.toHaveBeenCalledWith('unmount',expect.anything())
})
