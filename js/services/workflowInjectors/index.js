import { injectResize } from './resizeInjector.js';
import { injectHeadSwap } from './headSwapInjector.js';

export const INJECTORS = {
    resize: injectResize,
    headSwap: injectHeadSwap,
};
