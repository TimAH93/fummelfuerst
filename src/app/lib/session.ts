import { DEFAULT_CONTEXT, buildCatalog, buildCurriculum, createRng } from '../../core';

/** Built once per app start; both depend only on the (fixed) context. */
export const context = DEFAULT_CONTEXT;
export const catalog = buildCatalog(context);
export const curriculum = buildCurriculum(catalog);

/** Session randomness: a fresh seed per app start; every exercise seed is drawn from it. */
const seed = (crypto.getRandomValues(new Uint32Array(1))[0] ^ Date.now()) >>> 0;
export const rng = createRng(seed);
