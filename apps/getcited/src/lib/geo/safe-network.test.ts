import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import dns from 'node:dns/promises';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import type {IncomingMessage} from 'node:http';
const scope=vi.hoisted(()=>({mode:'live',deadlineMs:Date.now()+1000,signal:undefined as AbortSignal|undefined}));
vi.mock('@/lib/server/execution',()=>({requireExecution:()=>scope}));
import {safePublicGet} from './safe-network';
beforeEach(()=>{scope.deadlineMs=Date.now()+1000;scope.signal=undefined;vi.spyOn(dns,'lookup').mockResolvedValue([{address:'93.184.216.34',family:4}] as never);});
afterEach(()=>vi.restoreAllMocks());
function fakeWire(status:number,location?:string) {
 const body=new PassThrough() as PassThrough&IncomingMessage;body.statusCode=status;body.headers=location?{location}:{};
 const req=Object.assign(new EventEmitter(),{destroy:vi.fn(),end:vi.fn()});
 vi.spyOn(https,'request').mockImplementation(((url:URL,options:Record<string,unknown>,callback:(r:IncomingMessage)=>void)=>{
  expect(url.hostname).toBe('example.com');
  let pinned:unknown; (options.lookup as (...args:unknown[])=>void)('example.com',{all:true},(_e:unknown,value:unknown)=>{pinned=value;});
  expect(pinned).toEqual([{address:'93.184.216.34',family:4}]);
  req.end.mockImplementation(()=>queueMicrotask(()=>callback(body)));return req;
 }) as never);return{body,req};
}
it('destroys an endless redirect body and socket before rejecting its private target',async()=>{
 const {body,req}=fakeWire(302,'https://169.254.169.254/latest');
 await expect(safePublicGet('https://example.com/')).rejects.toThrow('Private destination');
 expect(body.destroyed).toBe(true);expect(req.destroy).toHaveBeenCalledTimes(1);expect(https.request).toHaveBeenCalledTimes(1);
});
it('Stop abort destroys an active pinned request and response',async()=>{
 const controller=new AbortController();scope.signal=controller.signal;const {body,req}=fakeWire(200);
 const pending=safePublicGet('https://example.com/');await new Promise(r=>setImmediate(r));body.write('partial');controller.abort();
 await expect(pending).rejects.toThrow('cancelled');expect(body.destroyed).toBe(true);expect(req.destroy).toHaveBeenCalledTimes(1);
});
it('Stop during pending DNS does not create a connection when DNS later resolves',async()=>{
 let complete!:(v:unknown)=>void;vi.mocked(dns.lookup).mockImplementation(()=>new Promise(r=>{complete=r;}) as never);
 const connect=vi.spyOn(https,'request');const controller=new AbortController();scope.signal=controller.signal;
 const pending=safePublicGet('https://example.com/');controller.abort();await expect(pending).rejects.toThrow('cancelled');complete([{address:'93.184.216.34',family:4}]);await new Promise(r=>setImmediate(r));expect(connect).not.toHaveBeenCalled();
});
