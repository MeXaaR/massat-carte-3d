import type {SearchItem,SearchKind} from './search';
export class SearchClient {
 private worker = new Worker(new URL('./search-worker.ts',import.meta.url),{type:'module'});
 private next = 0;
 private pending = new Map<number,{resolve:(value: any)=>void;reject:(error: Error)=>void;cleanup:()=>void}>();
 constructor() {
  this.worker.onmessage = ({data}) => {const entry=this.pending.get(data.id);if(!entry)return;this.pending.delete(data.id);entry.cleanup();data.error?entry.reject(new Error(data.error)):entry.resolve(data.result);};
  this.worker.onerror = () => {for(const entry of this.pending.values()){entry.cleanup();entry.reject(new Error('La recherche n’a pas pu démarrer.'));}this.pending.clear();};
 }
 private call<T>(op: string, fields: object, signal?: AbortSignal): Promise<T> {
  if(signal?.aborted)return Promise.reject(new DOMException('Cancelled','AbortError'));
  return new Promise((resolve,reject)=>{const id=++this.next;const abort=()=>{this.pending.delete(id);this.worker.postMessage({id,op:'cancel'});reject(new DOMException('Cancelled','AbortError'));};const cleanup=()=>signal?.removeEventListener('abort',abort);this.pending.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true});this.worker.postMessage({id,op,...fields});});
 }
 load(scope: string, codes: string[] = [], signal?: AbortSignal) {return this.call<{count:number}>('load',{scope,codes},signal);}
 query(input: string,kind: SearchKind|'all') {return this.call<{items:SearchItem[];total:number}>('query',{input,kind,limit:12});}
 get(key: string) {return this.call<SearchItem|undefined>('get',{key});}
}
