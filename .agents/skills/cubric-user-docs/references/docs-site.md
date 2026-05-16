# Cubric Docs Site Rules

The user-facing docs site is a sibling repository:

`C:\AI\Mpi\Cubric Studio (Docs)`

It is a static, hash-routed site. Write page content as HTML fragments under `pages/`, not full HTML documents.

## Current Routes

- `#/home` -> `pages/home.html`
- `#/getting-started` -> `pages/getting-started.html`
- `#/projects` -> `pages/projects.html`
- `#/gallery` -> `pages/gallery.html`
- `#/history` -> `pages/history.html`
- `#/models` -> `pages/models.html`
- `#/workflows` -> `pages/workflows.html`
- `#/hotkeys` -> `pages/hotkeys.html`

Route registration lives in:

- `C:\AI\Mpi\Cubric Studio (Docs)\index.html`
- `C:\AI\Mpi\Cubric Studio (Docs)\scripts\router.js`

## Fragment Pattern

Each page fragment should normally contain:

```html
<article class="content-article">
  <span class="kicker">Section · Page</span>
  <h1>Page title</h1>
  <p class="lead">Short page summary.</p>

  <h2 id="stable-anchor">Section title</h2>
  <p>Content.</p>
</article>

<aside class="docs-toc">
  <div class="toc-container">
    <h4>On this page</h4>
    <ul class="toc-list">
      <li><a href="#/route#stable-anchor">Section title</a></li>
    </ul>
  </div>
</aside>
```

Keep anchor ids lowercase and stable. Update the TOC when adding, removing, or renaming headings.

## Visual Assets

Default asset root:

`C:\AI\Mpi\Cubric Studio (Docs)\assets\docs\`

Reference assets from page fragments with paths relative to the docs site root:

```html
<figure class="docs-figure">
  <img src="assets/docs/gallery/gallery-selection-mode.png" alt="Gallery selection mode with selected media cards">
  <figcaption>Selected cards show actions in the Prompt Box.</figcaption>
</figure>
```

If the current CSS lacks a figure class, either use the existing placeholder classes or propose the minimal CSS addition in the approval brief. Do not introduce large design changes during content work.

## Style

- Preserve the Stage docs visual system.
- Do not add inline styles.
- Avoid new global classes unless needed.
- Prefer existing content classes: `content-article`, `lead`, `kicker`, `text-link`, `docs-table`, `docs-toc`, `toc-list`.
- Keep mascot usage rare. Home and empty states are appropriate; repeated mascot decoration is not.

## Git

The docs site is a separate git repository. If checking status or committing, run git from `C:\AI\Mpi\Cubric Studio (Docs)`, not from the app repo. Never commit or push unless the user explicitly asks.
