import { injectResize, RESIZE_CONSUMES } from './resizeInjector.js';
import { injectHeadSwap, HEAD_SWAP_CONSUMES } from './headSwapInjector.js';

/**
 * Each entry pairs the mutation with the param keys it CONSUMES. commandExecutor
 * deletes only those from the generic param map, so params the injector does not
 * handle still reach the generic title injector (MPI-306: Head Swap's Input_Tier
 * was being deleted along with its boxes and never reached the graph).
 */
export const INJECTORS = {
    resize: { inject: injectResize, consumes: RESIZE_CONSUMES },
    headSwap: { inject: injectHeadSwap, consumes: HEAD_SWAP_CONSUMES },
};
