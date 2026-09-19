import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSearch, type SearchItem } from './search.ts';
const data: SearchItem[] = ['09057','09065','09113','09182','09231','09241','09280'].flatMap(code => {
  const packed = JSON.parse(readFileSync(new URL(`../public/data/scopes/${code}/search-index.json`, import.meta.url), 'utf8'));
  return packed.rows.map(([id,kind,label,center,bounds,details,aliases]: any[]) => ({id,kind,label,center,bounds,details,aliases,commune:packed.commune[0],communeName:packed.commune[1]}));
});
const search = createSearch(data);
test('Les sept communes ont leur territoire complet et une entrée de recherche', () => {
 assert.deepEqual(data.filter(i=>i.kind==='commune').map(i=>i.commune).sort(),['09057','09065','09113','09182','09231','09241','09280']);
 assert.equal(search('').items.length,7);
 assert.equal(search('').items[0].label,'Massat');
});
test('Parcelles homonymes distinguées par commune, référence et numéro', () => {
 for(const q of ['F 1444','f1444','F 01444','parcelle F 1444']) assert.ok(search(q,'parcel',100).items.some(i=>i.id==='091820000F1444'),q);
 for(const q of ['091820000F1444','F1444 Massat','F 1444 Massat']) assert.equal(search(q).items[0]?.id,'091820000F1444',q);
 const expected=data.filter(i=>i.kind==='parcel' && i.details.number===141);
 const found=search('141','parcel',1000).items;
 for(const i of expected)assert.ok(found.some(j=>j.id===i.id),i.id);
 assert.ok(new Set(found.map(i=>i.commune)).size>1);
});
test('Les noms et numéros de routes restent prioritaires et filtrables par commune', () => {
 assert.equal(search('D618').items[0]?.kind,'road');
 assert.equal(search('Liers','hamlet').items[0]?.label,'Liers');
 const road=search('Rue de la Mairie Massat','road').items[0];
 assert.equal(road?.commune,'09182');assert.equal(road?.label.toLowerCase(),'rue de la mairie');
 assert.equal(search('RUE DE LA MAIRIE MASSAT','road').items[0]?.id,road.id);
 assert.equal(search('Erce','commune').items[0]?.commune,'09113');
 assert.equal(search('zzzzabsent').total,0);
});
test('Index complet, identifiants uniques, centres dans les emprises', () => {
 assert.equal(data.filter(i=>i.kind==='parcel').length,104499);
 assert.equal(new Set(data.map(i=>i.id)).size,data.length);
 for(const i of data){const[w,s,e,n]=i.bounds;assert.ok(i.center[0]>=w&&i.center[0]<=e&&i.center[1]>=s&&i.center[1]<=n,i.id);assert.ok(i.commune&&i.communeName);}
 assert.equal(data.find(i=>i.id==='092800000F0328')?.details.area,null);
});
