import { ComponentFactory } from '../../factory.js';
import { Events } from '../../../events.js';
import { ce, on, qs } from '../../../utils/dom.js';
import { renderIcon } from '../../../utils/icons.js';
import {
    cancelPendingCueJob,
    cancelRunningCueJob,
    clearPendingQueue,
    getGenerationQueueSnapshot,
} from '../../../services/generationService.js';

/**
 * MpiQueuePanel - Cue queue slide-over content.
 */
export const MpiQueuePanel = ComponentFactory.create({
    name: 'MpiQueuePanel',
    css: ['js/components/Compounds/MpiQueuePanel/MpiQueuePanel.css'],

    template: () => `
        <div class="mpi-queue-panel">
            <div class="mpi-queue-panel__head">
                <div class="mpi-queue-panel__brand">
                    <span class="mpi-queue-panel__brand-rule"></span>
                    <span class="mpi-queue-panel__title">Cue</span>
                </div>
                <div class="mpi-queue-panel__head-actions">
                    <span class="mpi-queue-panel__count"><b data-role="job-count">0</b> jobs</span>
                    <button class="mpi-queue-panel__icon-btn" data-action="clear" type="button" aria-label="Clear pending queue"></button>
                    <button class="mpi-queue-panel__icon-btn" data-action="close" type="button" aria-label="Close queue"></button>
                </div>
            </div>
            <div class="mpi-queue-panel__list"></div>
            <div class="mpi-queue-panel__foot">
                <span class="mpi-queue-panel__foot-label" data-role="queue-depth">Idle</span>
                <span class="mpi-queue-panel__foot-next" data-role="next-up"></span>
            </div>
        </div>`,

    setup: (el, props, emit) => {
        const countEl = qs('[data-role="job-count"]', el);
        const listEl = qs('.mpi-queue-panel__list', el);
        const clearBtn = qs('[data-action="clear"]', el);
        const closeBtn = qs('[data-action="close"]', el);
        const depthEl = qs('[data-role="queue-depth"]', el);
        const nextEl = qs('[data-role="next-up"]', el);
        const _unsubs = [];
        let _destroyed = false;

        clearBtn.innerHTML = renderIcon('trash', 'xs');
        closeBtn.innerHTML = renderIcon('close', 'xs');

        const _mediaUrl = (item) => item?.thumbPath || item?.url || item?.filePath || '';

        const _gcd = (a, b) => {
            let x = Math.abs(a);
            let y = Math.abs(b);
            while (y) [x, y] = [y, x % y];
            return x || 1;
        };

        const _ratioLabel = (job) => {
            if (job.ratio) return job.ratio;
            const width = Number(job.width) || 0;
            const height = Number(job.height) || 0;
            if (width > 0 && height > 0) {
                const factor = _gcd(width, height);
                return `${Math.round(width / factor)}:${Math.round(height / factor)}`;
            }
            return job.ratio || '';
        };

        const _dimensionsLabel = (job) => {
            const width = Number(job.width) || 0;
            const height = Number(job.height) || 0;
            return width > 0 && height > 0 ? `${width}x${height}` : '';
        };

        const _setRatio = (node, job) => {
            const width = Number(job.width) || 0;
            const height = Number(job.height) || 0;
            if (width > 0 && height > 0) node.style.aspectRatio = `${width} / ${height}`;
        };

        const _fitThumbFrame = (node, job) => {
            const width = Number(job.width) || 0;
            const height = Number(job.height) || 0;
            if (width <= 0 || height <= 0) return;

            if (width >= height) {
                node.style.setProperty('--thumb-frame-w', '100%');
                node.style.setProperty('--thumb-frame-h', `${Math.max(1, Math.min(100, (height / width) * 100))}%`);
            } else {
                node.style.setProperty('--thumb-frame-w', `${Math.max(1, Math.min(100, (width / height) * 100))}%`);
                node.style.setProperty('--thumb-frame-h', '100%');
            }
        };

        const _batchCount = (job) => Math.max(1, Number(job.batchCount) || 1);

        const _renderCountBadge = (job, fallbackCount = 0) => {
            const batchCount = _batchCount(job);
            const count = batchCount > 1 ? batchCount : fallbackCount;
            if (count <= 1) return null;
            return ce('span', {
                className: [
                    'mpi-queue-panel__thumb-count',
                    batchCount > 1 ? 'mpi-queue-panel__thumb-count--batch' : '',
                ].filter(Boolean).join(' '),
                textContent: `x${count}`,
            });
        };

        const _wireImageState = (wrap, img) => {
            wrap.classList.add('mpi-queue-panel__thumb--loading');

            const markLoaded = () => {
                wrap.classList.remove('mpi-queue-panel__thumb--loading');
                img.classList.add('mpi-queue-panel__thumb-img--loaded');
            };
            const markFailed = () => {
                wrap.classList.add('mpi-queue-panel__thumb--failed');
                img.removeAttribute('src');
            };

            img.onload = markLoaded;
            img.onerror = markFailed;
            if (img.complete && img.naturalWidth > 0) markLoaded();
        };

        const _renderMediaFrame = (job, src, className = '') => {
            const frame = ce('span', {
                className: ['mpi-queue-panel__thumb-frame', 'mpi-queue-panel__thumb-frame--media', className]
                    .filter(Boolean)
                    .join(' '),
            });
            _setRatio(frame, job);
            _fitThumbFrame(frame, job);

            const img = ce('img', {
                className: 'mpi-queue-panel__thumb-img',
                src,
                alt: '',
            });
            frame.appendChild(img);
            return { frame, img };
        };

        const _formatOperation = (value = '') => {
            const label = String(value || '').trim();
            return label ? label.replace(/[_-]+/g, ' ').toUpperCase() : 'GENERATE';
        };

        const _phaseLabel = (job) => {
            if (job.previewKind === 'preview') return 'Preview';
            if (job.previewKind === 'final') return 'Stage two';
            return '';
        };

        const _statusLabel = (job) => {
            if (job.status === 'running') {
                return ['Running', job.isLoop ? 'Loop' : '', _phaseLabel(job)]
                    .filter(Boolean)
                    .join(' · ');
            }
            return [job.isLoop ? 'Loop' : 'Pending', _phaseLabel(job)]
                .filter(Boolean)
                .join(' \u00b7 ');
        };

        const _statusTone = (job) => {
            if (job.status === 'running') return 'running';
            if (job.isLoop) return 'loop';
            return 'pending';
        };

        const _renderThumb = (job) => {
            const wrap = ce('div', { className: 'mpi-queue-panel__thumb' });
            const imageItems = (job.mediaItems || []).filter(item => item.mediaType === 'image' && _mediaUrl(item));
            const videoItem = (job.mediaItems || []).find(item => item.mediaType === 'video');
            const ratio = _ratioLabel(job);

            if (job.previewUrl) {
                wrap.classList.add('mpi-queue-panel__thumb--preview');
                const { frame, img } = _renderMediaFrame(job, job.previewUrl);
                wrap.appendChild(frame);
                const countBadge = _renderCountBadge(job);
                if (countBadge) wrap.appendChild(countBadge);
                _wireImageState(wrap, img);
                return wrap;
            }

            if (job.status === 'running') {
                wrap.classList.add('mpi-queue-panel__thumb--preview', 'mpi-queue-panel__thumb--loading');
                const frame = ce('span', {
                    className: 'mpi-queue-panel__thumb-frame mpi-queue-panel__thumb-frame--media',
                });
                _setRatio(frame, job);
                _fitThumbFrame(frame, job);
                wrap.appendChild(frame);
                const countBadge = _renderCountBadge(job);
                if (countBadge) wrap.appendChild(countBadge);
                return wrap;
            }

            if (imageItems.length) {
                wrap.classList.toggle('mpi-queue-panel__thumb--stack', imageItems.length > 1);
                imageItems.slice(0, 3).forEach((item, index) => {
                    wrap.appendChild(ce('img', {
                        className: `mpi-queue-panel__thumb-img mpi-queue-panel__thumb-img--${index + 1}`,
                        src: _mediaUrl(item),
                        alt: '',
                    }));
                });
                const countBadge = _renderCountBadge(job, imageItems.length);
                if (countBadge) wrap.appendChild(countBadge);
                return wrap;
            }

            if (videoItem?.thumbPath) {
                wrap.classList.add('mpi-queue-panel__thumb--video');
                const { frame, img } = _renderMediaFrame(job, videoItem.thumbPath);
                wrap.appendChild(frame);
                wrap.appendChild(ce('span', { className: 'mpi-queue-panel__thumb-badge', textContent: 'VIDEO' }));
                const countBadge = _renderCountBadge(job);
                if (countBadge) wrap.appendChild(countBadge);
                _wireImageState(wrap, img);
                return wrap;
            }

            wrap.classList.add(videoItem ? 'mpi-queue-panel__thumb--video' : 'mpi-queue-panel__thumb--empty');
            const frame = ce('span', { className: 'mpi-queue-panel__thumb-frame' });
            _setRatio(frame, job);
            _fitThumbFrame(frame, job);
            frame.appendChild(ce('span', { className: 'mpi-queue-panel__thumb-label', textContent: ratio || (videoItem ? 'VIDEO' : 'TEXT') }));
            wrap.appendChild(frame);
            const countBadge = _renderCountBadge(job);
            if (countBadge) wrap.appendChild(countBadge);
            return wrap;
        };

        const _renderAction = (job) => {
            const button = ce('button', {
                className: `mpi-queue-panel__action mpi-queue-panel__action--${job.canStop ? 'stop' : 'cancel'}`,
                type: 'button',
                innerHTML: `${renderIcon(job.canStop ? 'stop' : 'close', 'xs')}<span>${job.canStop ? 'Stop' : 'Cancel'}</span>`,
            });
            button.dataset.queueJobId = job.queueJobId || '';
            button.dataset.queueAction = job.canStop ? 'stop' : 'cancel';
            button.setAttribute('aria-label', job.canStop ? 'Stop current job' : 'Cancel queued job');
            return button;
        };

        const _renderJob = (job, index) => {
            const card = ce('article', {
                className: [
                    'mpi-queue-panel__item',
                    `mpi-queue-panel__item--${job.status}`,
                    job.isLoop ? 'mpi-queue-panel__item--loop' : '',
                ].filter(Boolean).join(' '),
            });

            card.appendChild(ce('span', {
                className: 'mpi-queue-panel__index',
                textContent: String(index + 1).padStart(2, '0'),
            }));
            card.appendChild(_renderThumb(job));

            const body = ce('div', { className: 'mpi-queue-panel__body' });
            const status = ce('div', { className: `mpi-queue-panel__status mpi-queue-panel__status--${_statusTone(job)}` });
            status.appendChild(ce('span', { className: 'mpi-queue-panel__dot' }));
            status.appendChild(ce('span', { textContent: _statusLabel(job) }));
            body.appendChild(status);
            body.appendChild(ce('div', {
                className: 'mpi-queue-panel__prompt',
                textContent: job.promptExcerpt || 'No prompt text',
            }));
            const ratio = _ratioLabel(job);
            const dimensions = _dimensionsLabel(job);
            const meta = ce('div', { className: 'mpi-queue-panel__meta' });
            // App gens (job.appTitle) show just the App name — the underlying
            // universal op ("APPIMAGEREGEN") is an implementation detail, not a model.
            meta.appendChild(ce('span', {
                className: 'mpi-queue-panel__meta-line mpi-queue-panel__meta-line--primary',
                textContent: job.appTitle
                    ? job.appTitle
                    : [job.modelName, _formatOperation(job.operation)].filter(Boolean).join(' / '),
            }));
            const sizeLabel = ratio && dimensions ? `${ratio} \u00b7 ${dimensions}` : ratio || dimensions;
            if (sizeLabel) {
                meta.appendChild(ce('span', {
                    className: 'mpi-queue-panel__meta-line mpi-queue-panel__meta-line--size',
                    textContent: sizeLabel,
                }));
            }
            // MPI-74: flag a force-local job. Only the 'local' exception is shown \u2014
            // default remote/local jobs carry no chip (absence = default engine).
            if (job.engine === 'local') {
                meta.appendChild(ce('span', {
                    className: 'mpi-queue-panel__meta-line mpi-queue-panel__meta-line--engine',
                    textContent: 'Local',
                }));
            }
            body.appendChild(meta);
            body.appendChild(_renderAction(job));
            card.appendChild(body);

            return card;
        };

        let _lastSig = '';
        const _cardByJobId = new Map();

        const _signature = (items) => items
            .map(j => `${j.queueJobId || ''}|${j.status}|${j.isLoop ? 1 : 0}|${j.previewKind || ''}|${j.previewUrl ? 1 : 0}|${j.promptExcerpt || ''}|${j.width}x${j.height}|${j.modelName || ''}|${j.operation || ''}|${j.engine || ''}`)
            .join('\n');

        const _patchPreview = (items) => {
            items.forEach((job) => {
                if (!job.previewUrl) return;
                const card = _cardByJobId.get(job.queueJobId);
                if (!card) return;
                const img = qs('.mpi-queue-panel__thumb-img', card);
                if (img && img.getAttribute('src') !== job.previewUrl) {
                    img.setAttribute('src', job.previewUrl);
                }
            });
        };

        const _render = (snapshot = getGenerationQueueSnapshot()) => {
            const items = snapshot.items || [];
            const pendingCount = snapshot.pendingCount || 0;
            countEl.textContent = String(items.length);
            clearBtn.disabled = pendingCount === 0;
            depthEl.textContent = items.length
                ? `${snapshot.runningCount || 0} running / ${pendingCount} queued`
                : 'Idle';
            nextEl.textContent = pendingCount ? `Next up · ${String((snapshot.runningCount || 0) + 1).padStart(2, '0')}` : '';

            const sig = _signature(items);
            if (sig === _lastSig && _cardByJobId.size === items.length) {
                _patchPreview(items);
                return;
            }
            _lastSig = sig;

            listEl.replaceChildren();
            _cardByJobId.clear();

            if (!items.length) {
                listEl.appendChild(ce('div', {
                    className: 'mpi-queue-panel__empty',
                    textContent: 'No queued generations.',
                }));
                return;
            }

            items.forEach((job, index) => {
                const card = _renderJob(job, index);
                if (job.queueJobId) _cardByJobId.set(job.queueJobId, card);
                listEl.appendChild(card);
            });
        };

        _unsubs.push(on(clearBtn, 'click', () => clearPendingQueue()));
        _unsubs.push(on(closeBtn, 'click', () => emit('close-request', {})));
        _unsubs.push(on(listEl, 'click', (event) => {
            const button = event.target.closest?.('.mpi-queue-panel__action');
            if (!button || !listEl.contains(button)) return;
            const queueJobId = button.dataset.queueJobId;
            if (button.dataset.queueAction === 'stop') cancelRunningCueJob(queueJobId);
            else cancelPendingCueJob(queueJobId);
        }));
        _unsubs.push(Events.on('generation-queue:changed', _render));
        _unsubs.push(Events.onState('loopArmed', () => _render()));

        const observer = new MutationObserver(() => {
            if (!document.contains(el)) {
                el.destroy?.();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        el.onOpen = () => _render();
        el.destroy = () => {
            if (_destroyed) return;
            _destroyed = true;
            _unsubs.forEach(fn => fn?.());
            observer.disconnect();
        };

        _render();
    },
});
