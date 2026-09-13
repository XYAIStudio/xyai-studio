import React,{useEffect,useState} from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { FORGE_CHANNEL,type AgentDraft, type ForgeSnapshot, type ProductionType } from '../protocol.ts'
import { CustomizationPage, type Call } from './page.tsx'
import './style.css'
declare module '@deepseek-ai/dsh-client-ui-slots'{interface LocaleNamespaceMap{xyaiAgentForge:'title'|'open'|'close'}}
const zh={title:'智能体定制',open:'打开智能体定制',close:'关闭'},en={title:'Agent customization',open:'Open agent customization',close:'Close'} as const
export const inject=['slots','locale','connection']
export function apply(ctx:Context):void{ctx.effect(()=>ctx.locale.register('xyaiAgentForge',{zh,en}),'xyai-agent-forge: dictionary');const connection=ctx.get('connection') as ConnectionHandle;const call=async<T,>(endpoint:string,payload?:unknown):Promise<T>=>{const rpc=await connection.rpc.call(FORGE_CHANNEL,endpoint,payload??null);if(!rpc.ok)throw new Error(rpc.error.message);const answer=rpc.value as {ok:boolean;value?:T;error?:{message:string}};if(!answer.ok)throw new Error(answer.error?.message??'操作失败');return answer.value as T};ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'xyai-agent-forge',order:33,locale:'xyaiAgentForge',inject:()=>({call})},function ForgeOverlay(props){const[open,setOpen]=useState(false);useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('xyai:open-agent-customization',show);return()=>window.removeEventListener('xyai:open-agent-customization',show)},[]);if(!open)return null;return <section className="xaf-overlay" role="dialog" aria-modal="true" aria-label={props.t('title')}><button className="xaf-close" onClick={()=>setOpen(false)}>{props.t('close')}</button><CustomizationPage call={props.call}/></section>}));ctx.slots.inject('conversation.session.header.utilities',()=>ctx.slots.register({name:'conversation.session.header.utilities',id:'xyai-agent-forge',order:30,locale:'xyaiAgentForge'},function ForgeEntry(props){return <button type="button" onClick={()=>window.dispatchEvent(new CustomEvent('xyai:open-agent-customization'))}>{props.t('open')}</button>}))}
export type Call=<T>(endpoint:string,payload?:unknown)=>Promise<T>
export type {AgentDraft,ForgeSnapshot,ProductionType}

