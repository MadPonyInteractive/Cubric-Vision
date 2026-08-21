# MPI-545 checklist

- [x] Pick + install the markdown module (self-contained browser ESM, sanitized output)
      -> `marked` 18.0.9 + `dompurify` 3.4.13, both zero-import single-file ESM
- [x] `js/utils/markdown.js` - shared `renderMarkdown` / `renderInlineMarkdown` /
      `renderMarkdownInto` / `wireMarkdownLinks`
- [x] `styles/markdown.css` - `.mpi-md` typography from `styles/01_base.css` tokens
- [x] `eye` icon in `js/utils/icons.js`
- [x] `MpiNotesEditor` - pencil/eye radio group, preview pane, textarea scrolls (dropped `autoHeight`)
- [x] `MpiChangelogDialog` - renders through the shared util, its 3-regex substitute deleted
- [x] `js/components/types.js` props updated
- [x] Verified in an isolated app instance - see validation.md
- [x] Polish pass: 880px dialog, --t-md body type, per-level heading colours
- [x] Documented in .claude/rules/dos_and_donts.md (briefing bullet + utilities list) so sub-agents inherit it
