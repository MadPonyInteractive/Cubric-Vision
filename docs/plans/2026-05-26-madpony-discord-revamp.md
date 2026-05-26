# Mad Pony Interactive — Discord Revamp

> **Pair plan:** [`2026-04-28-madpony-patreon-revamp.md`](2026-04-28-madpony-patreon-revamp.md). Patreon doc owns tier descriptions, welcome notes, currency, and bot-tier mapping. Both docs flagged for **joint revision** at implementation — Patreon scope may shift and Discord tier-channel names track it.
>
> **Strategy:** Full revamp of the existing MadPony Interactive Discord. Practical rebuild — roles + bot integrations + member list survive; channel taxonomy is reset. Identity pivots **MadPony-first** with Cubric Studio elevated as the lead sub-brand. Growth tactics deferred. Lifecycle + cleanup scope only.
>
> **Assets folder:** [`2026-05-26-madpony-discord-revamp-assets/`](2026-05-26-madpony-discord-revamp-assets/) — current-state screenshots captured 2026-05-26:
> - [`discord-channels-top.png`](2026-05-26-madpony-discord-revamp-assets/discord-channels-top.png) — channel list top (welcome, General, Small Talk)
> - [`discord-channels-bottom.png`](2026-05-26-madpony-discord-revamp-assets/discord-channels-bottom.png) — channel list bottom (Software, Themes, Cubric Studio)
> - [`discord-roles.png`](2026-05-26-madpony-discord-revamp-assets/discord-roles.png) — 12-role list
>
> **Brand reference (future):** `C:/AI/Mpi/MadPony-Identity/` — empty at plan-write time. Will hold MadPony visual identity, external-surface canonical URLs (Twitch, Gumroad, UE Marketplace, FlippedNormals, Instagram, Facebook), and any voice/copy guidelines. Discord rebuild consumes this folder at implementation.

---

## 1. Current State (captured 2026-05-26)

### Roles (12 total)

| Role | Type | Disposition |
|---|---|---|
| Team Member | human | keep |
| Creator | human (Fabio) | keep |
| Patreon | bot-managed (Patreon-Discord integration) | keep |
| Pro | tier (T3) | keep |
| Early Access | tier (T2) | keep |
| Supporter | tier (T1) | keep |
| Rythm | bot | audit — likely remove (music bot, legacy) |
| DJ | bot | audit — likely remove (music bot, legacy) |
| Buy Me a Coffee Bot | bot | audit — keep if still wired |
| Gumroad | bot | audit — likely keep (storefront still active) |
| Streamcord | bot | audit — keep if YouTube/Twitch go-live notifications matter |
| The Teacher | bot | investigate — purpose unknown to current owner |

### Channels (current sections)

- **General**: welcome, dev-updates, streams, general, share-your-work, feedback, downloads, AFK (voice)
- **Small Talk**: office-codes, Office Chat (voice), Office Chat Private (voice), Stream (voice)
- **Software**: unreal-engine, maya, substance-painter, zbrush, iclone, character-creator, blender, mari, marvelous-designer
- **Themes**: game-development, rigging, animation, character-design, anatomy, realism, design, cinematics, texturing
- **Cubric Studio**: news, beta-tests

### Server settings

- **Community server status:** unknown (assume **not enabled** — to be verified and enabled if missing). Conversion required for Onboarding, AutoMod, announcement channels, and discoverability.
- **Currency / locale:** N/A (Discord); Patreon-side currency is GBP per Patreon doc.

---

## 2. Target Identity

**Mad Pony Interactive — Open Source Local AI Tools for Creators**

Server wears MadPony brand. Cubric Studio is the lead sub-brand and gets visible real estate. Older MadPony product lines (ZBrush macros, Blender add-ons, IClone/Unreal plugins, tutorials) remain represented but no longer drive channel structure.

**Visual identity:** Pulled from `C:/AI/Mpi/MadPony-Identity/` at implementation. Discord server icon, banner, splash, role colours, and emoji set all source from there. Discord visual identity is **not the same** as Cubric apps' identity — similarities only, MadPony is the parent.

---

## 3. Server Description (255-char limit)

Confirmed during Patreon brainstorm — **open-source variant, 254 chars** (also lives in Patreon doc §6):

> Mad Pony Interactive — open source local AI tools, ComfyUI workflows, and creator tutorials. Home of Cubric Studio. Run powerful AI on your own PC. Early access via Patreon.

---

## 4. Channel Taxonomy (target state)

Full redesign. Software + Themes sections gone. New top-level sections lead with MadPony identity, surface Cubric Studio prominently, fold legacy product lines into a single section, gate Patreon-tier channels.

### Section layout (top → bottom)

1. **🏠 Start Here** — public, read-only orientation
2. **📣 Mad Pony** — public, announcement + dev-updates surface
3. **💬 Community** — public, conversational
4. **🎨 Cubric Studio** — public, app-focused
5. **🔓 Supporter** — Tier 1+ gated
6. **⚡ Early Access** — Tier 2+ gated
7. **👑 Pro** — Tier 3 only
8. **🛠️ Mad Pony Products** — public, per-product
9. **🔒 Staff** — Creator + Team Member only

### Channel manifest

Machine-readable manifest. Future Discord CLI/skill (see §9) consumes this to scaffold the server. `visibility` values: `public` / `tier1+` / `tier2+` / `tier3` / `staff`. `post` values: `everyone` / `verified` (Supporter+ link-gate from §7) / `staff`.

```yaml
sections:
  - name: Start Here
    channels:
      - name: welcome
        type: text
        visibility: public
        post: staff
        purpose: Server intro, rules link, Patreon link instructions
      - name: rules
        type: text
        visibility: public
        post: staff
        purpose: Rules + community guidelines; reaction-gate to enter rest of server
      - name: announcements
        type: announcement
        visibility: public
        post: staff
        purpose: Cross-posted to followers; release announcements, major news

  - name: Mad Pony
    channels:
      - name: dev-updates
        type: text
        visibility: public
        post: staff
        purpose: Behind-the-scenes dev posts (Patreon Tier 1 perk surface)
      - name: streams
        type: text
        visibility: public
        post: verified
        purpose: Twitch/YouTube go-live notifications + stream chat link-outs
      - name: roadmap
        type: text
        visibility: public
        post: staff
        purpose: Public roadmap snapshots, milestone announcements

  - name: Community
    channels:
      - name: general
        type: text
        visibility: public
        post: verified
        purpose: Open chat
      - name: share-your-work
        type: text
        visibility: public
        post: verified
        purpose: User showcases (Cubric outputs welcome, all media allowed)
      - name: feedback
        type: text
        visibility: public
        post: verified
        purpose: Open feedback on any MadPony product
      - name: introductions
        type: text
        visibility: public
        post: verified
        purpose: New-member intros (Onboarding flow targets this)
      - name: lounge
        type: voice
        visibility: public
        post: everyone
        purpose: Open voice (replaces "Office Chat")

  - name: Cubric Studio
    channels:
      - name: cubric-news
        type: text
        visibility: public
        post: staff
        purpose: Cubric Studio release notes, public-build drops
      - name: cubric-help
        type: text
        visibility: public
        post: verified
        purpose: Install/usage support, ComfyUI engine questions
      - name: cubric-workflows
        type: text
        visibility: public
        post: verified
        purpose: Workflow sharing (public — Pro templates live in #pro-builds)
      - name: cubric-bugs
        type: text
        visibility: public
        post: verified
        purpose: Bug reports (links to GitHub issues)

  - name: Supporter
    channels:
      - name: supporter-lounge
        type: text
        visibility: tier1+
        post: verified
        purpose: Tier 1 visible perk — back-of-house chat, dev posts before YouTube

  - name: Early Access
    channels:
      - name: early-access-builds
        type: text
        visibility: tier2+
        post: staff
        purpose: 2-week-early Cubric portable build drops (Win/Mac/Linux)
      - name: early-access-discussion
        type: text
        visibility: tier2+
        post: verified
        purpose: Build feedback, workflow sharing among Tier 2+
      - name: tutorial-files
        type: text
        visibility: tier2+
        post: staff
        purpose: ComfyUI workflows, source files, prompt packs from tutorials (Patreon Tier 2 promise)

  - name: Pro
    channels:
      - name: pro-builds
        type: text
        visibility: tier3
        post: staff
        purpose: Day-1 Cubric portable build drops
      - name: pro-templates
        type: text
        visibility: tier3
        post: staff
        purpose: Pro Project Template drops (drag-drop onto app)
      - name: pro-feedback
        type: text
        visibility: tier3
        post: verified
        purpose: 1-on-1 channel — direct line to Fabio, priority bug/feature

  - name: Mad Pony Products
    channels:
      - name: zbrush-tools
        type: text
        visibility: public
        post: verified
        purpose: ZBrush macros / older MadPony ZBrush products
      - name: blender-tools
        type: text
        visibility: public
        post: verified
        purpose: Blender add-ons (incl. Bezier curves addon if maintained — see Patreon §10 Q2)
      - name: iclone-unreal-tools
        type: text
        visibility: public
        post: verified
        purpose: IClone + Unreal plugins, third-party shop links (UE Marketplace, FlippedNormals)
      - name: tutorials
        type: text
        visibility: public
        post: staff
        purpose: New tutorial drops (Cubric Studio, ComfyUI, AI-native dev workflows)
      - name: shop-links
        type: text
        visibility: public
        post: staff
        purpose: Pinned canonical links to Gumroad, UE Marketplace, FlippedNormals (sourced from MadPony-Identity folder)

  - name: Staff
    channels:
      - name: staff-chat
        type: text
        visibility: staff
        post: staff
        purpose: Creator + Team Member private coordination
      - name: mod-log
        type: text
        visibility: staff
        post: staff
        purpose: AutoMod hits + manual reports (slot for future moderator role)
```

> **Manifest cross-check at implementation:** tier-channel names must match Patreon doc §9 checklist items. Confirm or update both docs in the same pass.

---

## 5. Roles — Target State

### Tier roles (Patreon-Discord bot managed)

| Role | Tier | Colour intent | Badge |
|---|---|---|---|
| Supporter | T1 (£1) | Soft accent — visible but understated | Custom |
| Early Access | T2 (£5) | Mid accent — distinctly tiered | Custom |
| Pro | T3 (£15) | Top accent — prominent | Custom |

Final colour values resolve against MadPony-Identity palette at implementation.

### Staff roles

| Role | Purpose |
|---|---|
| Creator | Fabio. Top of hierarchy. |
| Team Member | Future collaborators / trusted helpers. |

### Onboarding interest roles (Discord Community Onboarding feature, §6)

Members self-assign during Onboarding. Drive channel surfacing, not perms.

- `interest: image-gen`
- `interest: video-gen`
- `interest: tutorials`
- `interest: comfyui`
- `interest: legacy-tools` (ZBrush / Blender / IClone / Unreal — old MadPony catalog)

### Bot roles

Survive the audit (see §8) if their bot stays. No global decision at plan-write time.

---

## 6. Welcome Flow + Onboarding

### Entry sequence

1. **`#rules`** — reaction-gate. Pre-react = no access to anything beyond Start Here.
2. **Discord Community Onboarding** (built-in feature) — new members pick interest roles (§5).
3. **`#welcome`** — pinned post: who MadPony is, the "link your Patreon for tier roles" instruction, server description, links to MadPony-Identity-sourced external surfaces.
4. **`#introductions`** — optional self-intro after Onboarding.

### Welcome note copy (pinned in `#welcome`)

Draft — refine at implementation:

> Welcome to Mad Pony Interactive.
>
> This is the community for **Cubric Studio** — an open source, 1-click local AI desktop app — plus the rest of the MadPony toolset (ZBrush, Blender, IClone, Unreal) and the tutorials that go with them.
>
> **Three things to do:**
>
> 1. React in **#rules** to unlock the server.
> 2. **Link your Patreon account to Discord.** If you support at any tier, the Patreon bot will auto-assign your role (Supporter / Early Access / Pro) and unlock the tier channels.
> 3. Drop a hello in **#introductions** and pick your interests during Onboarding so the right channels surface for you.
>
> Builds, project templates, tutorial files, and the direct line all live in the gated channels — your tier role unlocks them automatically.
>
> — Fabio (Mad Pony Interactive)

---

## 7. Moderation

### AutoMod (Discord native)

Enable presets: spam, mention flood, harmful links, default keyword filters.

### Link-gate (verified-only posting)

Link-posting permission restricted to **Supporter+ tier roles** in public channels. Cuts drive-by scam/affiliate spam without requiring human mods. Implementation: per-channel permission overrides — `Embed Links` + `Attach Files` removed from `@everyone`, granted to Supporter / Early Access / Pro roles. Staff exempt.

**Exempt channels** (link-gate off): `#share-your-work` and `#cubric-workflows` need image/file posting for `@everyone` (showcases). Apply AutoMod URL filter instead.

### Mod role

**Not created at launch.** Slot left open. `#mod-log` channel exists for AutoMod hits — fillable later if community grows past solo-dev moderation capacity.

---

## 8. Bot Audit (implementation-phase task)

Catalog each existing bot. Decide keep / remove / investigate. Removal mechanics confirmed during this phase (owner has not removed bots before — research kick-and-revoke-invite-link flow first).

| Bot | Current role | Known purpose | Disposition slot |
|---|---|---|---|
| Patreon | Patreon | Tier-role auto-assign via Patreon-Discord integration | **KEEP** (load-bearing for new tier model) |
| Rythm | Rythm | Music bot | [ ] keep / [x] remove (likely) / [ ] investigate |
| DJ (DJ Porca) | DJ | Music bot | [ ] keep / [x] remove (likely) / [ ] investigate |
| Buy Me a Coffee Bot | Buy Me a Coffee Bot | Donation widget | [ ] keep / [ ] remove / [x] investigate (still wired?) |
| Gumroad | Gumroad | Storefront integration | [x] keep (likely) / [ ] remove / [ ] investigate |
| Streamcord | Streamcord | Twitch/YouTube go-live notifications | [ ] keep / [ ] remove / [x] investigate (relevance to launch?) |
| The Teacher | The Teacher | **Unknown** — owner does not recall | [ ] keep / [ ] remove / [x] investigate |

Decisions get logged into §11 (Open Questions) and applied during the rebuild pass.

---

## 9. Automation Investigation (research task)

**Goal:** find a CLI / Claude skill / MCP server that lets agents drive Discord server ops — channel create/delete, category create, permission overrides, role create/edit, role assign, emoji upload, bulk operations. Speeds the rebuild and seeds the broader MadPony ops agent.

### Candidates to evaluate

- **`discord.py` / `discord.js`** — write a one-shot rebuild script using the Bot API. Heavy but full-control.
- **`discord-cli` / `disco`-style npm CLIs** — quick scripts via Bot token. Lower ceiling, faster to wire.
- **Discord MCP servers** (search MCP registry for `discord-mcp`, `discord-server-manager`, etc.) — fits Claude Code natively.
- **Custom Claude skill** — wrap chosen API in a skill that exposes `create-channel`, `set-perms`, etc. Reusable across MadPony.

### Decision criteria

- Supports YAML/JSON manifest input (consume §4 manifest directly).
- Permission-override coverage (link-gate from §7 requires per-role overrides).
- Idempotent (re-running doesn't duplicate channels).
- Maintenance status (last commit < 6 months).

### Outcome

Pick one. Document the choice + setup steps in MadPony-Identity folder (`discord-ops.md`) — this is the seed for the broader **MadPony ops agent** vision: a single agent surface managing all MadPony social/web (Twitch, Gumroad, UE Marketplace, FlippedNormals, Instagram, Facebook, Discord, Patreon, YouTube).

---

## 10. Rebuild Checklist

### Pre-flight

- [ ] Populate `C:/AI/Mpi/MadPony-Identity/` minimally: server icon, banner, role colour hex values, external-surface canonical URL list, voice/copy guidelines stub.
- [ ] Confirm Patreon doc §9 checklist items still match this plan's tier-channel names. Adjust either doc if drifted.
- [ ] Verify Patreon-Discord bot is still authenticated and tier-mapping config exists (Patreon → Supporter / Early Access / Pro). Re-auth if stale.

### Discord Community conversion

- [ ] Enable Community feature in Server Settings.
- [ ] Designate `#rules` and `#announcements` (required channels).
- [ ] Enable AutoMod with default presets.
- [ ] Enable Onboarding flow (Server Settings → Onboarding).

### Bot audit (§8)

- [ ] Document removal procedure (kick + revoke invite + revoke OAuth scope where applicable).
- [ ] Run audit table — record decision per bot.
- [ ] Remove out-bots.
- [ ] Verify in-bots still authenticated and operational.

### Automation research (§9)

- [ ] Evaluate candidates against decision criteria.
- [ ] Pick one. Wire credentials. Test on a throwaway server first.
- [ ] Document setup in `MadPony-Identity/discord-ops.md`.

### Channel rebuild

- [ ] Export message history from channels-to-delete (Software, Themes, audit results from General/Small Talk) — optional, only if owner wants archives.
- [ ] Delete Software section channels (9 channels).
- [ ] Delete Themes section channels (9 channels).
- [ ] Audit General + Small Talk channels — save what's worth, delete the rest.
- [ ] Create new section taxonomy per §4 manifest (via CLI from §9 if picked, else manual).
- [ ] Apply permission overrides for tier-gated sections + link-gate in public channels.
- [ ] Apply Patreon-Discord bot tier→role→channel mapping.

### Onboarding + welcome

- [ ] Configure Onboarding interest roles (§5).
- [ ] Configure Onboarding "Default channels" → Start Here + Community.
- [ ] Pin welcome note in `#welcome` (§6 draft).
- [ ] Configure `#rules` reaction-gate.

### Identity polish

- [ ] Upload server icon + banner from MadPony-Identity folder.
- [ ] Set role colours from MadPony-Identity palette.
- [ ] Upload custom emoji set (if defined in MadPony-Identity).
- [ ] Set Server Description to the 254-char string from §3.

### Relaunch

- [ ] Post relaunch announcement in `#announcements` (cross-post enabled).
- [ ] Pair the relaunch post with the YouTube pivot video referenced in Patreon doc §9 (item 15).
- [ ] Drop the first Cubric Studio build post in the appropriate tier channel(s) the same day.

**No pre-rebuild pivot message** — the rebuild runs silently. Old members will see the change when the relaunch post hits `#announcements`.

---

## 11. Open Questions Before Publishing

1. **Bot disposition (§8)** — confirm keep/remove for every bot, especially:
   - **The Teacher** — investigate purpose first.
   - **Buy Me a Coffee Bot** — still receiving donations? If dormant, remove.
   - **Streamcord** — does YouTube/Twitch go-live notification matter enough for launch? If yes, keep. If "we'll set it up later", remove and revisit.
2. **Tier-channel name confirmation against Patreon doc §9** — `#early-access-builds` / `#early-access-discussion` / `#pro-builds` / `#pro-feedback` plus new additions `#supporter-lounge`, `#tutorial-files`, `#pro-templates`. Patreon doc lists only the first four — add the rest to Patreon doc §9 checklist at implementation, or trim Discord plan to match.
3. **MadPony-Identity folder population timing** — what's the minimum viable set of assets to populate before the Discord rebuild can start? Suggested floor: server icon + banner + role-colour hex values + external-URL list. Voice/copy can iterate.
4. **Discord CLI/skill/MCP choice (§9)** — which option survives evaluation? Affects whether channel creation is scripted or manual.
5. **General + Small Talk channel disposition** — owner's stated approach: "look and see what's worth saving." Concrete shortlist needed:
   - `welcome` → reused (slot owned by new welcome post).
   - `dev-updates` → reused (matches new `#dev-updates`).
   - `streams` → reused (matches new `#streams`).
   - `general`, `share-your-work`, `feedback`, `introductions` → reused (channel name + history kept, purpose unchanged).
   - `downloads`, `AFK`, `office-codes`, `Office Chat`, `Office Chat Private`, `Stream` → audit. Likely delete `downloads` + `office-codes` (legacy); `Office Chat` collapses to a single `lounge` voice channel; `AFK` keep if Discord still routes idle members there; `Stream` voice keep if used for streaming.
6. **Bezier curves Blender addon (Patreon §10 Q2)** — same status question pairs with `#blender-tools` channel scope. If maintained → featured. If legacy → omit from product channels.
7. **Sequencing lock** — Patreon doc and BACKLOG entries reference a post-launch sequencing lock (post-portable-distribution, post-website, post-Patreon-go-live). Discord rebuild slot-in: **after** Patreon revamp publishes, **before** YouTube pivot announcement. Confirm slot at implementation.
8. **History export** — bulk-export Software/Themes/General/Small Talk message history before deletion? Owner's stance: not worth it (links live on YouTube anyway). Plan assumes **no export** unless owner changes mind during pre-flight.

---

## 12. Cross-references

- **Patreon revamp:** [`2026-04-28-madpony-patreon-revamp.md`](2026-04-28-madpony-patreon-revamp.md) — tier descriptions, welcome notes, currency, Patreon-side checklist. Joint revision flagged.
- **Assets:** [`2026-05-26-madpony-discord-revamp-assets/`](2026-05-26-madpony-discord-revamp-assets/) — `discord-channels-top.png`, `discord-channels-bottom.png`, `discord-roles.png`.
- **Brand:** `C:/AI/Mpi/MadPony-Identity/` — populated separately, consumed at implementation.
- **Kanban entry:** "Madpony Discord Revamp" in `.agents/mpi-kanban/kanban.md`.
