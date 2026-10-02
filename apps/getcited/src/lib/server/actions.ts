import {headers} from 'next/headers';
import {actorFor} from './auth';
import {origin,checkOrigin,userLimit} from './security';
import {HttpError,errorCode} from './http';
import {executionFor,runWithExecution} from './execution';
export type ActionFailure={ok:false;code:'AUTH_REQUIRED'|'SESSION_CHANGED'|'CONFLICT'|'RATE_LIMITED'|'INVALID_INPUT'|'UNAVAILABLE';error:string};
export function actionFailure(error:unknown):ActionFailure{const e=error as {status?:number;message?:string};return {ok:false,code:errorCode(e) as ActionFailure['code'],error:error instanceof HttpError?error.message:'The request could not be completed. Please try again.'};}
export async function withAction<T>(expectedOwnerId:string,fn:(user:{id:string;email:string;sid:string})=>Promise<T>):Promise<T|ActionFailure>{
 try{const req=new Request(origin()+'/',{headers:await headers()});checkOrigin(req);const user=await actorFor(req);if(!user)throw new HttpError(401,'Sign in to continue.');if(expectedOwnerId!==user.id)throw new HttpError(409,'Your account changed. Refresh and try again.');await userLimit(user,'action',90,60);return await runWithExecution(executionFor(user),()=>fn(user));}catch(e){return actionFailure(e);}
}
