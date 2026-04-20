/**
 * Justified Layout (Google Photos-style) utilities.
 *
 * Provides row-packing using aspect ratios to build perfectly justified grids
 * where rows have uniform height and item widths scale to fill the container.
 */

/**
 * Build justified layout rows from groups with aspect ratios.
 * Each row's items are scaled so the row exactly fills containerWidth.
 * Last row is left-aligned at natural sizes (no scaling).
 *
 * @param {Array<{id: string, aspectRatio: number}>} items - Items with aspect ratios
 * @param {number} containerWidth - Available width in pixels
 * @param {number} gap - Gap between items in pixels
 * @returns {Array<{items: Array<{id, width, height}>, rowHeight: number}>}
 */
export function buildJustifiedRows(items, containerWidth, targetRowHeight, gap) {
    if (!items.length) return [];

    const rows = [];
    let row = [];
    let rowWidthSum = 0;

    for (const item of items) {
        const { id, aspectRatio } = item;
        const itemWidth = targetRowHeight * aspectRatio;

        // Test if adding this item exceeds container
        const testRowWidth = rowWidthSum + itemWidth + (row.length > 0 ? gap : 0);

        if (row.length > 0 && testRowWidth > containerWidth) {
            // Row is full — flush it
            rows.push({ items: row, rowWidth: rowWidthSum, gapCount: row.length - 1 });
            row = [{ id, aspectRatio }];
            rowWidthSum = itemWidth;
        } else {
            row.push({ id, aspectRatio });
            rowWidthSum = row.length === 1 ? itemWidth : rowWidthSum + itemWidth + gap;
        }
    }

    // Flush last row
    if (row.length > 0) {
        rows.push({ items: row, rowWidth: rowWidthSum, gapCount: row.length - 1, isLast: true });
    }

    // Compute actual widths and row height for each row
    return rows.map((rowData, rowIndex) => {
        const { items: rowItems, rowWidth, gapCount, isLast } = rowData;
        const isLastRow = isLast || rowIndex === rows.length - 1;

        if (isLastRow) {
            // Last row: no scaling, natural sizes at targetRowHeight
            return {
                items: rowItems.map(({ id, aspectRatio }) => ({
                    id,
                    width: Math.round(targetRowHeight * aspectRatio),
                    height: Math.round(targetRowHeight),
                })),
                rowHeight: targetRowHeight,
            };
        }

        // Non-last rows: scale to fill containerWidth exactly
        const availWidth = containerWidth - gapCount * gap;
        // rowWidth includes gaps, so we must subtract them to get the pure items width sum
        const itemsWidthSum = rowWidth - gapCount * gap;
        const scale = availWidth / itemsWidthSum;
        const scaledRowHeight = Math.round(targetRowHeight * scale);

        // Compute widths and ensure they sum to exactly fill container
        const widths = rowItems.map(({ id, aspectRatio }) => ({
            id,
            width: Math.round(targetRowHeight * scale * aspectRatio),
        }));

        // Distribute rounding error to last card to ensure perfect fit
        const totalWidth = widths.reduce((sum, w) => sum + w.width, 0);
        const error = availWidth - totalWidth;
        if (error !== 0 && widths.length > 0) {
            widths[widths.length - 1].width += error;
        }

        return {
            items: widths.map(({ id, width }) => ({
                id,
                width,
                height: scaledRowHeight,
            })),
            rowHeight: scaledRowHeight,
        };
    });
}
