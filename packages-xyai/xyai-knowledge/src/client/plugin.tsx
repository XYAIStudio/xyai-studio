/** DSH Client slots for the real local knowledge page. */
import {useEffect,useState} from 'react'
import type {Context} from '@deepseek-ai/cordis'
import type {ConnectionHandle} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import {CHANNEL} from '../protocol.ts'
import {KnowledgePage,type Call} from './page.tsx'
import {en,zh,type Key} from './locales.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' {interface LocaleNamespaceMap {/** Knowledge page dictionary. */xyaiKnowledge:Key}}
/** Required Client services. */
export const inject=['slots','locale','connection','uiWorkspace']
/** Create the typed Client caller over DSH's single RPC result layer.
 * @param connection - Active DSH connection.
 * @returns Knowledge endpoint caller.
 */
export function createCall(connection:Pick<ConnectionHandle,'rpc'>):Call{
 return async<T,>(endpoint:string,payload?:unknown):Promise<T>=>{
  const result=await connection.rpc.call(CHANNEL,endpoint,payload??null)
  if(!result.ok)throw new Error(result.error.message)
  return result.value as T
 }
}
/** Register discoverable settings and conversation pages plus the shell entry.
 * @param ctx - Client context.
 */
export function apply(ctx:Context):void{
 ctx.effect(()=>ctx.locale.register('xyaiKnowledge',{en,zh}),'xyai-knowledge: dictionary')
 const connection=ctx.get('connection') as ConnectionHandle
 const listDirectory=(path?:string)=>ctx.uiWorkspace.listDirectory(path)
 const call=createCall(connection)
 ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'xyai-knowledge',locale:'xyaiKnowledge',label:()=>ctx.locale.bind('xyaiKnowledge')('title'),order:125},function KnowledgeSettings(props){return <KnowledgePage call={call} t={props.t} listDirectory={listDirectory}/>}))
 ctx.slots.inject('conversation.view',()=>ctx.slots.register({name:'conversation.view',id:'xyai-knowledge',locale:'xyaiKnowledge',label:()=>ctx.locale.bind('xyaiKnowledge')('title'),order:45},function KnowledgeView(props){return <KnowledgePage call={call} t={props.t} listDirectory={listDirectory}/>}))
 ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'xyai-knowledge',locale:'xyaiKnowledge',order:45},function KnowledgeOverlay(props){const [opened,setOpened]=useState(false);useEffect(()=>{const open=()=>setOpened(true);window.addEventListener('xyai:open-knowledge',open);return()=>window.removeEventListener('xyai:open-knowledge',open)},[]);if(!opened)return null;return <section role="dialog" aria-label={props.t('title')} style={{position:'fixed',inset:0,zIndex:85,overflow:'auto',background:'var(--dsw-alias-bg-base,white)'}}><button type="button" onClick={()=>setOpened(false)}>{props.t('close')}</button><KnowledgePage call={call} t={props.t} listDirectory={listDirectory}/></section>}))
}



