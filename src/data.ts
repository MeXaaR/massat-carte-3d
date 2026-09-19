declare const __DATA_REVISION__: string;
export const productionData = typeof __DATA_REVISION__ !== 'undefined';
const revision = productionData ? __DATA_REVISION__ : 'massat-scopes-dev';
export const dataUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}?v=${revision}`;
