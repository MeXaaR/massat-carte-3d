import {createSearch, type SearchItem, type SearchKind} from './search';
import {dataUrl, productionData} from './data';
const context = globalThis as unknown as {onmessage: ((event: MessageEvent) => void) | null; postMessage: (message: unknown) => void};
let search = createSearch([]), lookup = new Map<string, SearchItem>();
let controller: AbortController | undefined, loadingId = 0;
type Packed = {version: 1; commune: [string,string]; rows: [string,SearchKind,string,[number,number],[number,number,number,number],SearchItem['details'],string[]][]};
async function load(code: string, signal: AbortSignal): Promise<SearchItem[]> {
 const response = await fetch(dataUrl(`scopes/${code}/${productionData ? 'search-index' : 'search'}.json`), {signal});
 if (!response.ok) throw new Error(`Recherche indisponible (${response.status})`);
 if (!productionData) return response.json();
 const packed: Packed = await response.json();
 return packed.rows.map(([id,kind,label,center,bounds,details,aliases]) => ({id,kind,label,center,bounds,details,aliases,commune:packed.commune[0],communeName:packed.commune[1]}));
}
context.onmessage = async ({data}) => {
 const {id,op} = data;
 if (op === 'cancel') { if (loadingId === id) controller?.abort(); return; }
 try {
  let result: unknown;
  if (op === 'load') {
   controller?.abort(); controller = new AbortController(); loadingId = id;
   const items = (await Promise.all((data.scope ? [data.scope] : data.codes).map((code: string) => load(code,controller!.signal)))).flat();
   if (loadingId !== id) return;
   search = createSearch(items); lookup = new Map(items.map(item => [item.id,item])); result = {count:items.length};
  } else if (op === 'query') result = search(data.input,data.kind,data.limit);
  else if (op === 'get') result = lookup.get(data.key);
  else throw new Error('Unknown search operation');
  context.postMessage({id,result});
 } catch (error) { context.postMessage({id,error:error instanceof Error ? error.message : String(error)}); }
};
