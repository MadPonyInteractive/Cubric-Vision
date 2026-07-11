/**
 * resizeInjector.js — Tool-specific workflow mutation for Resize operations.
 *
 * Generic command params still flow through commandExecutor._buildParams().
 * This injector only writes Resize Image v2 / flip / rotate fields that are
 * not part of the standard title map.
 */

'use strict';

const RESIZE_TITLE = 'resize image v2';
const FLIP_TITLE = 'input_flip_image';
const ROTATE_TITLE = 'input_rotate_image';
const FLIP_ENABLED_TITLE = 'input_flip';

const DEFAULTS = Object.freeze({
    width: 512,
    height: 512,
    upscale_method: 'lanczos',
    keep_proportion: 'crop',
    pad_color: Object.freeze({ r: 0, g: 0, b: 0 }),
    crop_position: 'center',
    divisible_by: 1,
    flip: 'none',
    rotation: 'none',
});

const UPSCALE_METHODS = new Set([
    'nearest',
    'exact',
    'bilinear',
    'area',
    'bicubic',
    'lanczos',
    'nvidia_rtx_vsr',
]);

const KEEP_PROPORTIONS = new Set([
    'stretch',
    'resize',
    'pad',
    'pad_edge',
    'pad_edge_pixel',
    'crop',
    'pillarbox_blur',
    'total_pixels',
]);

const CROP_POSITIONS = new Set(['center', 'top', 'bottom', 'left', 'right']);

const FLIP_METHODS = Object.freeze({
    x: 'x-axis: vertically',
    y: 'y-axis: horizontally',
});
const FLIP_OFF_VALUES = new Set(['none', 'off', 'false', false, null, undefined]);

const ROTATIONS = Object.freeze({
    none: 'none',
    90: '90 degrees',
    180: '180 degrees',
    270: '270 degrees',
});

function _nodesByTitle(workflow, title) {
    const normalized = String(title).toLowerCase();
    return Object.values(workflow || {}).filter(node =>
        node?._meta?.title?.toLowerCase() === normalized
    );
}

function _requireNodes(workflow, title) {
    const nodes = _nodesByTitle(workflow, title);
    if (!nodes.length) {
        throw new Error(`Resize workflow is missing node titled "${title}"`);
    }
    return nodes;
}

function _positiveInt(value, fallback) {
    const next = Number(value);
    return Number.isFinite(next) && next >= 1 ? Math.round(next) : fallback;
}

function _choice(value, allowed, fallback) {
    return allowed.has(value) ? value : fallback;
}

function _channel(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return 0;
    return Math.max(0, Math.min(255, Math.round(next)));
}

function _normalizePadColor(value = DEFAULTS.pad_color) {
    return {
        r: _channel(value.r),
        g: _channel(value.g),
        b: _channel(value.b),
    };
}

function _normalizeFlip(value) {
    if (FLIP_OFF_VALUES.has(value)) return 'none';
    if (value === 'x' || value === 'y') return value;
    return DEFAULTS.flip;
}

/**
 * @typedef {Object} ResizeParams
 * @property {number} width
 * @property {number} height
 * @property {string} upscale_method
 * @property {string} keep_proportion
 * @property {{r:number,g:number,b:number}} pad_color
 * @property {string} crop_position
 * @property {number} divisible_by
 * @property {'none'|'x'|'y'} flip
 * @property {'none'|'90'|'180'|'270'} rotation
 */

/**
 * Mutates (and returns) the workflow JSON in place with resize params applied.
 * Looks up nodes by `_meta.title`, not numeric ids, so this works for both the
 * image and video resize workflows.
 * @param {Record<string, any>} workflow
 * @param {Partial<ResizeParams>} params
 * @returns {Record<string, any>}
 */
export function injectResize(workflow, params = {}) {
    const padColor = _normalizePadColor(params.pad_color);
    const values = {
        width: _positiveInt(params.width, DEFAULTS.width),
        height: _positiveInt(params.height, DEFAULTS.height),
        upscale_method: _choice(params.upscale_method, UPSCALE_METHODS, DEFAULTS.upscale_method),
        keep_proportion: _choice(params.keep_proportion, KEEP_PROPORTIONS, DEFAULTS.keep_proportion),
        pad_color: `${padColor.r}, ${padColor.g}, ${padColor.b}`,
        crop_position: _choice(params.crop_position, CROP_POSITIONS, DEFAULTS.crop_position),
        divisible_by: _positiveInt(params.divisible_by, DEFAULTS.divisible_by),
        flip: _normalizeFlip(params.flip),
        rotation: Object.prototype.hasOwnProperty.call(ROTATIONS, params.rotation)
            ? String(params.rotation)
            : DEFAULTS.rotation,
    };

    _requireNodes(workflow, RESIZE_TITLE).forEach(node => {
        Object.assign(node.inputs, {
            width: values.width,
            height: values.height,
            upscale_method: values.upscale_method,
            keep_proportion: values.keep_proportion,
            pad_color: values.pad_color,
            crop_position: values.crop_position,
            divisible_by: values.divisible_by,
            device: 'cpu',
        });
    });

    _requireNodes(workflow, FLIP_TITLE).forEach(node => {
        node.inputs.flip_method = FLIP_METHODS[values.flip] || FLIP_METHODS.x;
    });

    _requireNodes(workflow, ROTATE_TITLE).forEach(node => {
        node.inputs.rotation = ROTATIONS[values.rotation];
    });

    _requireNodes(workflow, FLIP_ENABLED_TITLE).forEach(node => {
        node.inputs.boolean = values.flip === 'x' || values.flip === 'y';
    });

    return workflow;
}
