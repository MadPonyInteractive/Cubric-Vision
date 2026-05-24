## Sub-Agent Briefing
> Component event wiring split by tier. Match scope, read that file.

| Scope | File |
|---|---|
| Primitives + Compounds | `.claude/rules/component-events-primitives.md` |
| Organisms (viewers, tool options, video chain, concatProgress) | `.claude/rules/component-events-organisms.md` |
| Blocks (MpiGalleryGrid, MpiPromptBox, MpiGalleryBlock, MpiGroupHistoryBlock) | `.claude/rules/component-events-blocks.md` |
| Generation lifecycle (Active Generation Registry, commandExecutor, StatusBar) | `.claude/rules/component-events-lifecycle.md` |

When unsure which tier a component belongs to, grep across the four files — entries are unique.
