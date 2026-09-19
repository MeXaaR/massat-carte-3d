export type SearchKind = 'parcel' | 'hamlet' | 'road' | 'commune';
export interface SearchItem {
  id: string; kind: SearchKind; label: string;
  commune: string; communeName: string;
  center: [number, number]; bounds: [number, number, number, number];
  details: { section?: string; number?: number; area?: number; elevation?: number; nature?: string; segments?: number; population?: number };
  aliases: string[];
}
export const kindNames = { parcel: 'Parcelle', hamlet: 'Lieu habité', road: 'Voie', commune: 'Commune' };
export function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/gi, 'oe').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function createSearch(items: SearchItem[]) {
  const index = items.map(item => ({ item, label: normalize(item.label), aliases: item.aliases.map(normalize), words: normalize([item.label, ...item.aliases].join(' ')) }));
  return (input: string, kind: SearchKind | 'all' = 'all', limit = 12): { items: SearchItem[]; total: number } => {
    const query = normalize(input);
    if (!query) {
      const defaults = ['massat', 'liers', 'eycherboul', 'lirbat', 'peyou'];
      const matches = index.filter(row => kind === 'all' ? row.item.kind === 'commune' : row.item.kind === kind)
        .sort((a, b) => (defaults.indexOf(a.label) < 0 ? 99 : defaults.indexOf(a.label)) - (defaults.indexOf(b.label) < 0 ? 99 : defaults.indexOf(b.label)) || a.label.localeCompare(b.label, 'fr'));
      return { items: matches.slice(0, 7).map(row => row.item), total: matches.length };
    }
    const compact = query.replace(/ /g, '');
    const parcel = query.replace(/^(parcelle|section)\s+/, '').match(/^([a-z]{1,2})\s*0*(\d{1,5})$/);
    const number = /^\d{1,5}$/.test(query) ? Number(query) : null;
    const tokens = query.split(' ');
    const matches: { item: SearchItem; score: number }[] = [];
    for (const row of index) {
      const item = row.item;
      if (kind !== 'all' && item.kind !== kind) continue;
      let score = 0;
      if (item.kind === 'parcel' && item.id.toLowerCase() === compact) score = 120;
      else if (item.kind === 'road' && row.label === query) score = 118;
      else if (item.kind === 'parcel' && parcel && item.details.section?.toLowerCase() === parcel[1] && item.details.number === Number(parcel[2])) score = 115;
      else if (item.kind === 'parcel' && number !== null && item.details.number === number) score = 100;
      else if (row.label === query) score = 95;
      else if (row.label.replace(/ /g, '') === compact) score = 90;
      else if (row.aliases.includes(query)) score = 85 + tokens.filter(token => row.label.includes(token)).length / tokens.length;
      else if (row.label.startsWith(query)) score = 80;
      else if (tokens.every(token => row.words.includes(token))) score = 60 + 10 * tokens.filter(token => row.label.includes(token)).length / tokens.length;
      if (score) matches.push({ item, score });
    }
    matches.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label, 'fr', { numeric: true }) || a.item.communeName.localeCompare(b.item.communeName, 'fr'));
    return { items: matches.slice(0, limit).map(row => row.item), total: matches.length };
  };
}
