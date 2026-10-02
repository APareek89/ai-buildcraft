import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {actorFor} from './server/auth';
import {origin} from './server/security';
import {currentExecution,validateExecution} from './server/execution';
import {ownerId} from './db/client';
import {HttpError} from './server/http';
export async function getUser(){
 const e=currentExecution();if(e){await validateExecution();return {id:e.ownerId,email:''};}
 const requestHeaders=await headers();
 const actor=await actorFor(new Request(origin()+'/',{headers:requestHeaders}));
 return actor?{id:actor.id,email:actor.email}:null;
}
export async function requireUser(next='/assistant'):Promise<{id:string;email:string}>{const user=await getUser();if(!user)redirect('/login?next='+encodeURIComponent(next));return user;}
export async function repositoryOwner(expected?:string){const user=await getUser();if(!user)throw new HttpError(401,'Sign in to continue.');if(expected&&ownerId(expected)!==user.id)throw new HttpError(404,'Resource not found.');return user.id;}
