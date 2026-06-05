import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiIcon } from '../../Primitives/MpiIcon/MpiIcon.js';
import { qs } from '../../../utils/dom.js';
import { emptyReleaseNotes } from '../../../data/releaseNotes.js';

/**
 * MpiChangelogDialog — "What's New" startup overlay (Compound)
 *
 * A blocking modal that describes the already-running app version after a
 * version bump/update. It is NOT an updater — it never checks the network or
 * polls for releases. It simply renders the release notes it is handed.
 *
 * Used as a singleton from shell.js, shown once per APP_VERSION:
 *   const dlg = MpiChangelogDialog.mount(document.createElement('div'));
 *   dlg.el.open({ version, stage, notes });
 *   dlg.el.show();
 *   dlg.on('dismiss', () => Storage.setLastSeenChangelogVersion(version));
 *
 * Props: none (content is provided via open()).
 *
 * Instance methods (on instance.el):
 *   open({ version, stage, notes }) — set content before showing
 *   show()  — portal + blocking backdrop (idempotent)
 *   hide()  — release overlay
 *
 * Emits:
 * 'dismiss' { version } — user closed via Done button (Escape/backdrop also hide
 *                         the modal but do NOT emit dismiss; the seen-version is
 *                         only persisted on an explicit Done — see shell wiring).
 */

const SECTIONS = [
  { key: 'breakingChanges',  title: 'Breaking changes',  icon: 'bolt',    tone: 'breaking' },
  { key: 'importantChanges', title: 'Important',         icon: 'info',    tone: 'important' },
  { key: 'whatIsNew',        title: "What's new",        icon: 'sparkle', tone: 'new' },
  { key: 'fixes',            title: 'Fixes',             icon: 'check',   tone: 'fixes' },
  { key: 'engineNotes',      title: 'Engine',            icon: 'bolt',    tone: 'engine' },
];

export const MpiChangelogDialog = ComponentFactory.create({
  name: 'MpiChangelogDialog',
  css: ['js/components/Compounds/MpiChangelogDialog/MpiChangelogDialog.css'],

  template: () => `
    <div class="mpi-changelog" role="dialog" aria-modal="true" aria-labelledby="changelog-title">
      <div class="mpi-changelog__header">
        <div class="mpi-changelog__kicker" id="changelog-kicker"></div>
        <div class="mpi-changelog__title" id="changelog-title">What's New</div>
      </div>
      <div class="mpi-changelog__body" id="changelog-body"></div>
      <div class="mpi-changelog__actions" id="changelog-actions"></div>
    </div>
  `,

  setup: (el, props, emit) => {
    // ── Modal primitive — owns backdrop, portal, Overlays, Events ──────────
    const modal = MpiModal.mount(document.createElement('div'), {
      width: 'min(540px, 92vw)',
      backdropClose: true,
    });
    modal.el.appendChild(el);
    el.show = () => modal.el.show();
    el.hide = () => modal.el.hide();

    const kickerSlot = qs('#changelog-kicker', el);
    const bodySlot = qs('#changelog-body', el);
    const actionsSlot = qs('#changelog-actions', el);

    let _version = '';

    // ── Render a single section (heading + bullet list) ────────────────────
    const _renderSection = ({ key, title, icon, tone }, notes) => {
      const items = Array.isArray(notes[key]) ? notes[key] : [];
      if (items.length === 0) return; // empty sections stay hidden

      const section = document.createElement('div');
      section.className = `mpi-changelog__section mpi-changelog__section--${tone}`;

      const heading = document.createElement('div');
      heading.className = 'mpi-changelog__section-heading';
      const iconEl = MpiIcon.mount(document.createElement('span'), { name: icon, size: 'sm' });
      heading.appendChild(iconEl.el);
      const label = document.createElement('span');
      label.className = 'mpi-changelog__section-title';
      label.textContent = title;
      heading.appendChild(label);
      section.appendChild(heading);

      const list = document.createElement('ul');
      list.className = 'mpi-changelog__list';
      items.forEach((text) => {
        const li = document.createElement('li');
        li.className = 'mpi-changelog__item';
        li.textContent = text;
        list.appendChild(li);
      });
      section.appendChild(list);
      bodySlot.appendChild(section);
    };

    // ── open — set content (call before show) ──────────────────────────────
    el.open = ({ version, stage, notes } = {}) => {
      _version = version || '';
      const data = notes || emptyReleaseNotes(_version);

      // Kicker: "Alpha · v0.0.1" style label (stage optional)
      const stageLabel = stage ? `${stage} · ` : '';
      kickerSlot.textContent = `${stageLabel}v${_version}`;

      // Rebuild body from scratch (idempotent across repeated open() calls)
      bodySlot.replaceChildren();
      SECTIONS.forEach((s) => _renderSection(s, data));
    };

    // ── Done button — only this path emits dismiss + persists seen version ─
    const doneBtn = MpiButton.mount(document.createElement('div'), {
      text: 'Done',
      variant: 'primary',
      size: 'md',
    });
    doneBtn.on('click', () => {
      emit('dismiss', { version: _version });
      el.hide();
    });
    actionsSlot.appendChild(doneBtn.el);

    el.destroy = () => {
      modal.el.hide?.();
      modal.el.destroy?.();
    };
  },
});
