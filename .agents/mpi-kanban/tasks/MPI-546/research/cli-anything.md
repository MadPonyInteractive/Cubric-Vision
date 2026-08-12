# CLI-Anything as the Cubric CLI path — evaluated 2026-08-12

<https://github.com/HKUDS/CLI-Anything> — Apache-2.0, Python 3.10+ / Click, 47k stars,
4.3k forks, created 2026-03-08, last push 2026-08-03. Actively maintained, permissive
licence. Tagline: "Making ALL Software Agent-Native".

Generates a CLI for a target app through a 7-phase pipeline, invoked as a Claude Code
plugin: `/cli-anything ./path-to-software`. Emits a Click package, tests, a `SKILL.md`,
and publishes to PyPI via its own `cli-hub` registry.

## Verdict: it wraps a surface, it does not create one

Every harness drives something the app **already exposes**. Their own rule: *"The CLI
MUST call the actual application for rendering. No Pillow replacements for GIMP, no
custom renderers for Blender."* For the localhost-REST targets — Ollama, **ComfyUI**,
AdGuard Home, n8n — the generated CLI is a plain client of an existing endpoint.

So it does not remove MPI-546; it depends on it. No generator can wrap a route that is
not there.

## The concrete trap: run it now and the headline command is broken

A source-analysis pipeline pointed at this repo finds `/proxy/prompt`, correctly reads
it as "submits a prompt to ComfyUI", and emits `cubric-vision generate`. That command
runs the graph on the engine and **produces nothing in the UI** — precisely the failure
this card exists to fix. The gap is written down in `.claude/skills/cubric-vision/SKILL.md`
§ "Known gap", but nothing guarantees the pipeline weighs that over the source.

Order matters: route first, generate second.

## Where it earns its place

Once `POST /connector/generate` exists, Vision sits in the pattern CLI-Anything supports
best — localhost REST, running instance, the same slot as ComfyUI and Ollama. Roughly 20
endpoints are already documented in `SKILL.md`, i.e. most of a CLI's surface area sitting
there unwrapped. Wrapping that by hand is a week of boring work; this is one command.

It also hardens the plan's seam from a preference into a requirement: **a generated CLI
codes against the route and never sees the SSE relay**, so the relay stays free to be
replaced when dispatch eventually moves server-side.

## The cost, unresolved

It emits a **Python** Click package on PyPI. Vision is Node/Electron shipping a portable
Windows build with no Python in the user story. Fine while the CLI is a dev/agent tool for
producing the film; a real problem if it ever ships to users. Fabio's call, and it does not
change MPI-546 either way.

## Two CLI shapes — only one is on this path

- **Remote-control CLI** (app open, project open): what MPI-546 delivers. The western-film
  use case exactly — agent submits, cards land in the gallery for review.
- **Headless CLI** (no window, straight to disk): needs dispatch extracted out of the
  renderer. `generationService` imports `MpiToast`, `PromptBoxControls` and dom `ce`;
  `commandExecutor` pulls `state`, `Events`, `downloadService`, `progressAggregator`.
  3,670 lines, irreducibly renderer-bound. A separate project.

## Next step

Ship MPI-546. Then run `/cli-anything` against the finished surface and judge the actual
output — cheap trial, real artifact, no commitment.
