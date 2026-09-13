/** Persistent data and RPC types for the Agent Customization production line. */
import type { Branded } from '@deepseek-ai/dsh-brand'
export const FORGE_CHANNEL='/xyai-agent-forge'
export type DraftId=Branded<'AgentForgeDraft'>
export type ProductionType='advisor'|'workflow'|'research'|'team'
export type ForgeStep=1|2|3|4|5|6
export interface ResourceRef { id:string; version:string; name:string; kind:'knowledge'|'model'|'capability'; status:'ready'|'pending'|'unavailable' }
export interface WorkflowNode { id:string; title:string; input:string; output:string; acceptance:string; onFailure:string; dependsOn:string[] }
export interface TeamRole { name:string; role:string; responsibility:string }
export interface AgentDraft { id:DraftId; revision:number; createdAt:string; updatedAt:string; step:ForgeStep; productionType:ProductionType; name:string; industry:string; description:string; rules:Record<string,string>; resources:ResourceRef[]; workflow:WorkflowNode[]; team:TeamRole[]; humanReview:boolean; testEvidence:TestEvidence[]; status:'draft'|'ready-for-review'|'approved' }
export interface TestEvidence { id:string; kind:'preflight'|'team-run'; createdAt:string; passed:boolean; summary:string; details:string[] }
export interface ForgeSnapshot { drafts:AgentDraft[] }
export interface ReleaseChecklist { draftId:DraftId; revision:number; generatedAt:string; status:'blocked'|'ready'; items:Array<{label:string; passed:boolean; action:string}> }
