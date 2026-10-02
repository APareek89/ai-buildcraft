import {randomUUID} from 'node:crypto';
import type {UIMessage} from 'ai';
import {and,eq} from 'drizzle-orm';
import {query,transaction,drizzleDatabase,schema} from '../db/client';
import {saveConfigVersion,getConfigById,type ConfigView} from '../db/configs';
import {PostgresGeoStore} from '../db/geo-store';
import {savePlan,getPlanById,type PlanView} from '../db/plans';
import {createThread,getThread,getThreadMessages,saveThreadMessages} from '../db/threads';
import {InProcessPanelRunner,buildReport,allocatePlan,projectImpact,computeCitations,computeSentiment} from '../geo';
import {requireExecution,runWithExecution} from './execution';
import {HttpError} from './http';
import type {BenchmarkOutput} from '@/components/assistant/benchmark-result';
import type {PlanOutput} from '@/components/assistant/result-cards';
import {PRODUCTIVE_HOURS_PER_WEEK} from '../geo/plan';
import {isoDate,weekDueDate} from '../geo/schedule';
import type {FullReport} from '../geo/report';
import type {RoadmapDoc} from '../geo/schedule';
export const EXAMPLES=[{id:'team-tools',title:'A team-tools visibility plan',description:'Four prepared buyer answers, a budgeted action plan and an editable tracker after approval. No provider calls.',prepared:true}];
function benchmarkOutput(report:FullReport,domains:string[]):BenchmarkOutput & {prepared:true}{
 const analysis=report.answers.map(a=>({prompt:a.prompt,rawAnswer:a.raw_answer,citedDomains:a.cited_domains,sentiment:a.sentiment}));
 const citations=computeCitations(report.brand,analysis,domains),sentiment=computeSentiment(report.brand,analysis);
 return {report_id:report.report_id,prepared:true,brand:report.brand,panel:report.panel,answer_count:report.answers.length,cost_usd:report.cost_usd,share_of_voice:report.share_of_voice,your_citation_share:citations.your_citation_share,total_citations:citations.total_citations,citation_gap_count:citations.competitor_gap.length,sentiment:{score:sentiment.sentiment_score,distribution:sentiment.distribution}};
}
function planOutput(plan:PlanView,config:ConfigView,reportId:string):PlanOutput & {report_id:string;prepared:true}{
 if(!plan.projection)throw new Error('Prepared projection is unavailable.');
 const roadmap=plan.roadmap as RoadmapDoc;
 return {prepared:true,plan_id:plan.id,report_id:reportId,budget_usd:config.budgetUsd,team_size:config.teamSize,timeline_weeks:config.timelineWeeks,person_hours:config.teamSize*config.timelineWeeks*PRODUCTIVE_HOURS_PER_WEEK,spent_usd:plan.tactics.reduce((n,t)=>n+t.costUsd,0),spent_hours:plan.tactics.reduce((n,t)=>n+t.effortHours,0),tactics:plan.tactics,projection:plan.projection,roadmap_overview:roadmap.weeks.map(w=>({week:w.week,theme:w.theme,kpi_checkpoint:w.kpi_checkpoint,due_date:isoDate(weekDueDate(plan.createdAt,w.week)),action_count:w.actions.length})),execution_guidelines:roadmap.guidelines};
}
export async function createExample(){
 const actor=requireExecution(),lease=randomUUID();
 const state=await transaction(async c=>{
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,91097))',[actor.ownerId]);
  const current=(await c.query('select * from getcited_examples where owner_id=$1 for update',[actor.ownerId])).rows[0];
  if(current?.status==='complete')return current;
  if(current?.status==='building'&&new Date(current.updated_at).getTime()>Date.now()-180000)throw new HttpError(409,'The example is being prepared. Please try again shortly.');
  if(current){await c.query("update getcited_examples set lease_id=$2,status='building',updated_at=now() where owner_id=$1",[actor.ownerId,lease]);return {...current,lease_id:lease};}
  return (await c.query("insert into getcited_examples(owner_id,lease_id,status) values($1,$2,'building') returning *",[actor.ownerId,lease])).rows[0];
 });
 const result=()=>({prepared:true,configId:state.config_id,runId:state.run_id,planId:state.plan_id,threadId:state.thread_id});
 if(state.status==='complete'){
  // Upgrade only missing display fields of the canonical saved tool result. The
  // report, plan, message IDs and any tracker annotations remain authoritative.
  const cfg=await getConfigById(state.config_id),report=await buildReport(new PostgresGeoStore(actor.ownerId),state.run_id),plan=await getPlanById(state.plan_id),thread=await getThread(state.thread_id);
  if(!cfg?.prepared||!report?.prepared||!plan?.prepared||!thread?.prepared)throw new Error('Prepared checkpoint is unavailable.');
  const messages=await getThreadMessages(state.thread_id),changed:UIMessage[]=[];
  for(const message of messages){let dirty=false;for(const part of message.parts){
   if((part.type!=='tool-run_benchmark'&&part.type!=='tool-build_plan')||part.state!=='output-available')continue;
   const expected=part.type==='tool-run_benchmark'?benchmarkOutput(report,cfg.brandDomains):part.type==='tool-build_plan'?planOutput(plan,cfg,report.report_id):null;
   if(expected&&JSON.stringify(part.output)!==JSON.stringify(expected)){part.output=expected;dirty=true;}
  }if(dirty)changed.push(message);}
  if(changed.length){const db=await drizzleDatabase();await db.transaction(async tx=>{for(const message of changed)await tx.update(schema.threadMessages).set({parts:message.parts}).where(and(eq(schema.threadMessages.userId,actor.ownerId),eq(schema.threadMessages.threadId,state.thread_id),eq(schema.threadMessages.messageId,message.id)));});}
  return result();
 }
 async function checkpoint(field:'config_id'|'run_id'|'plan_id'|'thread_id',id:string){await query(`update getcited_examples set ${field}=$3,updated_at=now() where owner_id=$1 and lease_id=$2`,[actor.ownerId,lease,id]);state[field]=id;}
 try{return await runWithExecution({...actor,mode:'prepared'},async()=>{
  let config=state.config_id?await getConfigById(state.config_id):null;
  if(!config){
   config=await saveConfigVersion(actor.ownerId,{brandUrl:'https://linear.app',brandName:'Linear',description:'Prepared team-tools comparison. Buyer answers and citation evidence are illustrative fixtures.',brandDomains:['linear.app'],competitors:['Asana','Jira'],competitorDomains:['asana.com','atlassian.com'],queries:["What's the best issue tracker for a fast-moving software team?","Which project management tool works best for remote teams?","Recommend a tool to plan sprints and track team workload.","Best way to manage tasks across multiple product teams?"],budgetUsd:400,teamSize:2,timelineWeeks:8,mode:'we_serve'},true);
   await checkpoint('config_id',config.id);

  }
  const store=new PostgresGeoStore(actor.ownerId,config.id);
  let report=state.run_id?await buildReport(store,state.run_id):null;
  if(!report||report.status!=='completed'){const out=await new InProcessPanelRunner(store,{keys:{},costCapUsd:0,forceMock:true,parserMode:'deterministic'}).run({brand:config.brandName!,brand_domains:config.brandDomains,competitors:config.competitors,prompts:config.queries,panel:['openai'],runs:1});await checkpoint('run_id',out.report_id);report=await buildReport(store,out.report_id);}
  if(!report)throw new Error('Prepared report was not persisted.');
  let plan=state.plan_id?await getPlanById(state.plan_id):null;
  if(!plan){
   const gaps=[{sourceType:'roundup' as const,you:0,leader:3,deficit:3},{sourceType:'owned' as const,you:0,leader:2,deficit:2}];
   const allocation=allocatePlan({budgetUsd:400,teamSize:2,timelineWeeks:8,gaps});
   const projection=projectImpact({currentCitationShare:0,tactics:allocation.tactics,timelineWeeks:8,grounding:{crawl:false}});
   projection.assumptions.unshift('Prepared example: citation gaps and buyer answers are illustrative, not observed market evidence.');
   const roadmap:RoadmapDoc={weeks:allocation.tactics.slice(0,8).map((t,i)=>({week:i+1,theme:t.name,actions:[{tactic_id:t.id,action:'Prepare '+t.name.toLowerCase(),why:'Illustrate the '+(t.closesGap||'citation visibility')+' gap in this prepared example.',how:['Review the stated assumptions and replace them with your own evidence.','Draft the deliverable for a human review before any publication.'],owner_role:'Marketing lead',hours:Math.min(25,t.effortHours),deliverable:'Reviewed draft and evidence notes'}],kpi_checkpoint:'Record completed work separately from any measured citation outcome.'})),guidelines:['This is a prepared plan, not a measured improvement promise.','Approve the plan explicitly before it enters the tracker.','Tracker updates are your annotations; this example does not publish content.']};
   plan=await savePlan({userId:actor.ownerId,configId:config.id,configVersion:config.version,runId:report.report_id,tactics:allocation.tactics,projection,roadmap},true);await checkpoint('plan_id',plan.id);
  }
  let thread=state.thread_id?await getThread(state.thread_id):null;if(!thread){thread=await createThread(actor.ownerId,'Prepared team-tools example',true);await checkpoint('thread_id',thread.id);}
  const output=benchmarkOutput(report,config.brandDomains);
  const messages:UIMessage[]=[{id:randomUUID(),role:'user',parts:[{type:'text',text:'Show the prepared team-tools visibility example and its budgeted plan.'}]},{id:randomUUID(),role:'assistant',parts:[{type:'text',text:'Prepared example: these buyer answers and citation gaps are illustrative. The real scoring and allocation code produced the saved report and plan, with no provider calls.'},{type:'tool-run_benchmark',toolCallId:randomUUID(),state:'output-available',input:{},output},{type:'tool-build_plan',toolCallId:randomUUID(),state:'output-available',input:{},output:planOutput(plan,config,report.report_id)}]}];
  await saveThreadMessages(actor.ownerId,thread.id,messages,true);
  await query("update getcited_examples set status='complete',updated_at=now() where owner_id=$1 and lease_id=$2",[actor.ownerId,lease]);return result();
 });}catch(error){await query("update getcited_examples set status='failed',updated_at=now() where owner_id=$1 and lease_id=$2",[actor.ownerId,lease]);throw error;}
}
