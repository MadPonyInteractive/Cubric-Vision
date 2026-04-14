/**
 * Justified Layout (Google Photos-style) utilities.
 *
 * Provides row-packing and proportional image resize for adaptive grids
 * where rows have uniform height and item widths scale to fill the container.
 */

/**
 * Packs items into rows using the justified layout algorithm.
 * Each row's total width (including gaps) approaches but does not exceed containerWidth.
 *
 * @param {Array<{id: string, targetWidth: number}>} items - Items with desired widths
 * @param {number} containerWidth - Available width in pixels
 * @param {number} gap - Gap between items in pixels
 * @param {number} targetCardWidth - Target card width used for initial estimate
 * @returns {Array<{items: Array<{id, targetWidth}>, rowWidth: number}>}
 */
export function packItemsIntoRows(items, containerWidth, gap, targetCardWidth) {
    const rows = [];
    let row = [];
    let rowWidthSum = 0;

    for (const item of items) {
        const { id, targetWidth } = item;
        const testRow = [...row, { id, targetWidth }];
        const testWidth = rowWidthSum + targetWidth + (row.length > 0 ? gap : 0);

        if (row.length > 0 && testWidth > containerWidth) {
            // Row is full — flush it and start a new one
            rows.push({ items: row, rowWidth: rowWidthSum });
            row = [{ id, targetWidth }];
            rowWidthSum = targetWidth;
        } else {
            row.push({ id, targetWidth });
            rowWidthSum = row.length === 1 ? targetWidth : rowWidthSum + targetWidth + gap;
        }
    }

    if (row.length > 0) {
        rows.push({ items: row, rowWidth: rowWidthSum });
    }

    return rows;
}

/**
 * Resizes all images in a row proportionally so their total widths fill the row.
 * Loads image dimensions internally via Promise.all, then computes and applies
 * proportional widths and row height.
 *
 * @param {HTMLElement} rowEl - The row container element
 * @param {string} itemSelector - CSS selector for item wrappers within the row
 * @param {string} imgSelector - CSS selector for the image within each item wrapper
 * @param {number} gap - Gap between items in pixels
 * @param {number} rowWidth - Explicit width of the row
 * @returns {Promise<{rowHeight: number, widths: number[]}>}
 */
export function resizeRowImages(rowEl, itemSelector, imgSelector, gap, rowWidth) {
    const items = rowEl.querySelectorAll(itemSelector);

    const loaders = Array.from(items).map(wrapper => {
        return new Promise(resolve => {
            const img = wrapper.querySelector(imgSelector);
            if (!img || !img.src) {
                resolve({ wrapper, width: 1, height: 1 });
                return;
            }
            if (img.complete && img.naturalWidth > 0) {
                resolve({ wrapper, width: img.naturalWidth, height: img.naturalHeight });
            } else {
                img.onload = () => resolve({ wrapper, width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = () => resolve({ wrapper, width: 1, height: 1 });
            }
        });
    });

    return Promise.all(loaders).then(results => {
        const totalAspectSum = results.reduce((sum, r) => sum + r.width / r.height, 0);
        const availWidth = rowWidth - (results.length - 1) * gap;
        const rowHeight = availWidth / totalAspectSum;

        rowEl.style.height = `${Math.round(rowHeight)}px`;
        results.forEach(r => {
            r.wrapper.style.width = `${Math.round(rowHeight * r.width / r.height)}px`;
        });

        return { rowHeight, widths: results.map(r => Math.round(rowHeight * r.width / r.height)) };
    });
}
