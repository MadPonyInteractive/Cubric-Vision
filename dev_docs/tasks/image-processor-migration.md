# Task: Image Processor Migration to Utils

## Status
- [x] Move `js/imageProcessor.js` to `js/utils/imageProcessor.js`
- [x] Update internal imports in `js/utils/imageProcessor.js`
- [x] Update external imports in consumers
- [x] Verify migration

## Details
- Source: `js/imageProcessor.js`
- Target: `js/utils/imageProcessor.js`

### External Consumers
1. `js/toolUtils.js`
2. `js/tools/llm.js`
3. `js/tools/generator.js`
4. `js/tools/descriptor.js`
5. `js/tools/compare.js`
6. `js/init.js`
