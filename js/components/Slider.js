/**
 * Slider.js — Premium Slider component with editable labels and container-based wheel.
 */
export class Slider {
    /**
     * @param {HTMLElement} container - Elements will be injected or parented here.
     * @param {Object} config
     * @param {number} [config.min=0]
     * @param {number} [config.max=1]
     * @param {number} [config.step=0.01]
     * @param {number} [config.value=0.5]
     * @param {'horizontal'|'vertical'} [config.orientation='horizontal']
     * @param {string} [config.title] - Optional label text
     * @param {boolean} [config.showValue=true] - Whether to show the current value
     * @param {string} [config.unit=''] - Suffix for the display value
     * @param {boolean} [config.wheel=true] - Enable scroll wheel support
     * @param {boolean} [config.popup=false] - Whether to show as a popup on hover
     * @param {boolean} [config.minimal=false] - If true, removes border/background
     * @param {string} [config.name] - Name for the hidden input (for forms)
     * @param {(value: number) => void} [config.onChange] - Fired on drag/wheel
     * @param {(value: number) => void} [config.onCommit] - Fired on mouseup/wheel stop
     */
    constructor(container, config = {}) {
        this.container = container;
        this.min = config.min ?? 0;
        this.max = config.max ?? 1;
        this.step = config.step ?? 0.01;
        this.value = config.value ?? (this.min + this.max) / 2;
        this.orientation = config.orientation ?? 'horizontal';
        this.title = config.title;
        this.showValue = config.showValue ?? true;
        this.unit = config.unit ?? '';
        this.wheel = config.wheel ?? true;
        this.popup = config.popup ?? false;
        this.minimal = config.minimal ?? false;
        this.name = config.name;
        this.onChange = config.onChange;
        this.onCommit = config.onCommit;

        this.isDragging = false;
        this.isEditing = false;
        this._wheelTimeout = null;

        this.initDOM();
        this.bindEvents();
        this.updateUI();
    }

    initDOM() {
        this.el = document.createElement('div');
        this.el.className = `mpi-slider mpi-slider--${this.orientation} ${this.popup ? 'mpi-slider--popup' : ''} ${this.minimal ? 'mpi-slider--minimal' : ''}`;
        
        // Hidden input for form serialization
        if (this.name) {
            this.input = document.createElement('input');
            this.input.type = 'hidden';
            this.input.name = this.name;
            this.input.className = 'mpi-slider__hidden-input';
            this.input.value = this.value;
            this.el.appendChild(this.input);
        }
        
        let labelRow = '';
        if (this.title || this.showValue) {
            labelRow = `<div class="mpi-slider__label-row">
                ${this.title ? `<span class="mpi-slider__title">${this.title}</span>` : ''}
                ${this.showValue ? `<span class="mpi-slider__value">${this.formatValue(this.value)}${this.unit}</span>` : ''}
            </div>`;
        }

        this.el.innerHTML = `
            ${labelRow}
            <div class="mpi-slider__track-container">
                <div class="mpi-slider__track"></div>
                <div class="mpi-slider__fill"></div>
                <div class="mpi-slider__handle"></div>
            </div>
        `;

        this.container.appendChild(this.el);

        this.trackContainer = this.el.querySelector('.mpi-slider__track-container');
        this.fill = this.el.querySelector('.mpi-slider__fill');
        this.handle = this.el.querySelector('.mpi-slider__handle');
        this.valueLabel = this.el.querySelector('.mpi-slider__value');
    }

    bindEvents() {
        // Drag Interaction
        this.trackContainer.addEventListener('mousedown', (e) => this.startDragging(e));
        window.addEventListener('mousemove', (e) => this.handleDragging(e));
        window.addEventListener('mouseup', () => this.stopDragging());

        // Mouse Wheel (on entire container as requested)
        if (this.wheel) {
            this.el.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        }

        // Editable Label
        if (this.valueLabel) {
            this.valueLabel.addEventListener('dblclick', () => this.startEditing());
        }

        // Popup logic
        if (this.popup) {
            // Usually managed by external trigger, but component can handle its own hover
            this.container.addEventListener('mouseenter', () => this.show());
            this.container.addEventListener('mouseleave', () => this.hide());
        }
    }

    formatValue(val) {
        if (this.step < 1) return parseFloat(val).toFixed(2);
        return Math.round(val);
    }

    updateUI() {
        const pct = ((this.value - this.min) / (this.max - this.min)) * 100;
        this.el.style.setProperty('--val-pct', pct);
        if (this.valueLabel && !this.isEditing) {
            this.valueLabel.innerHTML = `${this.formatValue(this.value)}${this.unit}`;
        }
    }

    setValue(val, silent = false) {
        if (this.isDisabled) return;
        val = Math.max(this.min, Math.min(this.max, val));
        this.value = val;
        if (this.input) this.input.value = this.value;
        this.updateUI();
        if (!silent && this.onChange) this.onChange(this.value);
    }

    setDisabled(disabled) {
        this.isDisabled = !!disabled;
        this.el.classList.toggle('is-disabled', this.isDisabled);
    }

    getValue() {
        return this.value;
    }

    startDragging(e) {
        this.isDragging = true;
        this.handleDragging(e);
        this.el.classList.add('is-dragging');
    }

    handleDragging(e) {
        if (!this.isDragging) return;
        const rect = this.trackContainer.getBoundingClientRect();
        let pct;

        if (this.orientation === 'horizontal') {
            pct = (e.clientX - rect.left) / rect.width;
        } else {
            pct = 1 - (e.clientY - rect.top) / rect.height;
        }

        const val = this.min + pct * (this.max - this.min);
        this.setValue(this.snap(val));
    }

    stopDragging() {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.el.classList.remove('is-dragging');
        if (this.onCommit) this.onCommit(this.value);
    }

    snap(val) {
        const inv = 1 / this.step;
        return Math.round(val * inv) / inv;
    }

    handleWheel(e) {
        e.preventDefault();
        const direction = e.deltaY < 0 ? 1 : -1;
        const delta = direction * this.step;
        
        // Multiplier for faster scrolling if needed
        const multiplier = e.shiftKey ? 10 : 1;
        this.setValue(this.value + (delta * multiplier));

        // Commit logic for wheel (debounce)
        clearTimeout(this._wheelTimeout);
        this._wheelTimeout = setTimeout(() => {
            if (this.onCommit) this.onCommit(this.value);
        }, 300);
    }

    startEditing() {
        if (this.isEditing || !this.valueLabel) return;
        this.isEditing = true;
        const originalText = this.formatValue(this.value);
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'mpi-slider__edit-input';
        input.value = originalText;
        
        this.valueLabel.innerHTML = '';
        this.valueLabel.appendChild(input);
        input.focus();
        input.select();

        const commit = () => {
            if (!this.isEditing) return;
            const newVal = parseFloat(input.value);
            if (!isNaN(newVal)) {
                this.setValue(newVal);
                if (this.onCommit) this.onCommit(this.value);
            }
            this.isEditing = false;
            this.updateUI();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
                this.isEditing = false;
                this.updateUI();
            }
        });
        input.addEventListener('blur', commit);
    }

    show() {
        if (this.popup) this.el.classList.add('visible');
    }

    hide() {
        if (this.popup) this.el.classList.remove('visible');
    }

    destroy() {
        this.el.remove();
    }
}
