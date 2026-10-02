"use server";
import {withAction,type ActionFailure} from "@/lib/server/actions";
import {approvePlanToTracker,updateTrackerItem,isTrackerStatus,type TrackerStatus} from "@/lib/db/tracker";
import {getPlanById} from "@/lib/db/plans";
import {HttpError} from "@/lib/server/http";
export async function approvePlanAction(planId:string,expectedOwnerId:string):Promise<{ok:true;created:number;alreadyApproved:boolean}|ActionFailure>{return withAction(expectedOwnerId,async user=>{const plan=await getPlanById(planId);if(!plan)throw new HttpError(404,'Plan not found.');return {ok:true as const,...await approvePlanToTracker(user.id,plan)};});}
export async function updateTrackerItemAction(input:{id:string;status?:string;remarks?:string},expectedOwnerId:string):Promise<{ok:true}|ActionFailure>{return withAction(expectedOwnerId,async()=>{const patch:{status?:TrackerStatus;remarks?:string}={};if(input.status!==undefined){if(!isTrackerStatus(input.status))throw new HttpError(400,'Invalid status.');patch.status=input.status;}if(input.remarks!==undefined){if(typeof input.remarks!=='string'||input.remarks.length>2000)throw new HttpError(400,'Remarks must be at most 2,000 characters.');patch.remarks=input.remarks;}if(!Object.keys(patch).length)throw new HttpError(400,'Nothing to update.');await updateTrackerItem(input.id,patch);return {ok:true as const};});}
