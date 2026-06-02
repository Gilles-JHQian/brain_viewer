/**
 * UI Controls — Handles all left sidebar interactions and coordinates
 * data loading, filtering, and view updates.
 */
class UIControls {
    constructor(app) {
        this.app = app;

        // DOM elements - Data Type
        this.selReference = document.getElementById('select-reference');
        this.selDataType = document.getElementById('select-data-type');
        this.selDiffType = document.getElementById('select-diff-type');
        this.selDiffDirection = document.getElementById('select-diff-direction');
        this.diffTypeGroup = document.getElementById('diff-type-group');
        this.diffDirectionGroup = document.getElementById('diff-direction-group');

        // DOM elements - Phase & Condition
        this.selPhase = document.getElementById('select-phase');
        this.selCondition = document.getElementById('select-condition');
        this.conditionGroup = document.getElementById('condition-group');

        // DOM elements - Filters (multi-select)
        this.subjectList = document.getElementById('subject-list');
        this.roiList = document.getElementById('roi-list');
        this.btnSubjectAll = document.getElementById('btn-subject-all');
        this.btnSubjectNone = document.getElementById('btn-subject-none');
        this.btnROIAll = document.getElementById('btn-roi-all');
        this.btnROINone = document.getElementById('btn-roi-none');
        this.selHemi = document.getElementById('select-hemi');
        this.chkSigOnly = document.getElementById('chk-sig-only');

        // DOM elements - Sig Group
        this.sigGroupSection = document.getElementById('sig-group-section');
        this.chkSigGroup = document.getElementById('chk-sig-group');
        this.sigGroupControls = document.getElementById('sig-group-controls');
        this.sigGroupPhaseList = document.getElementById('sig-group-phase-list');
        this.sigGroupConditionList = document.getElementById('sig-group-condition-list');
        this.sigGroupConditionGroup = document.getElementById('sig-group-condition-group');
        this.sigGroupDirectionList = document.getElementById('sig-group-direction-list');
        this.sigGroupDirectionGroup = document.getElementById('sig-group-direction-group');
        this.sigGroupPhaseGroup = document.getElementById('sig-group-phase-group');

        // DOM elements - Color mode
        this.selColorMode = document.getElementById('select-color-mode');
        this.hgaColorControls = document.getElementById('hga-color-controls');
        this.hgaTimeMin = document.getElementById('hga-time-min');
        this.hgaTimeMax = document.getElementById('hga-time-max');
        this.selHGACmap = document.getElementById('select-hga-cmap');
        this.btnApplyHGAColor = document.getElementById('btn-apply-hga-color');

        // DOM elements - CLim controls
        this.selClimMode = document.getElementById('select-clim-mode');
        this.climPctControls = document.getElementById('clim-percentile-controls');
        this.climAbsControls = document.getElementById('clim-absolute-controls');
        this.climPctMin = document.getElementById('clim-pct-min');
        this.climPctMax = document.getElementById('clim-pct-max');
        this.climAbsMin = document.getElementById('clim-abs-min');
        this.climAbsMax = document.getElementById('clim-abs-max');

        // DOM elements - Two-way cmap
        this.chkTwoWayCmap = document.getElementById('chk-two-way-cmap');

        // DOM elements - View controls
        this.viewButtons = document.querySelectorAll('.view-btn');
        this.clipSlider = document.getElementById('clip-slider');
        this.clipAxis = document.getElementById('clip-axis');

        // DOM elements - Info panel
        this.infoVisibleCount = document.getElementById('info-visible-count');
        this.infoTotalCount = document.getElementById('info-total-count');
        this.infoSigCount = document.getElementById('info-sig-count');
        this.infoSubjectCount = document.getElementById('info-subject-count');
        this.infoSelected = document.getElementById('info-selected');

        // DOM elements - Electrode detail
        this.detailName = document.getElementById('detail-name');
        this.detailSubject = document.getElementById('detail-subject');
        this.detailChannel = document.getElementById('detail-channel');
        this.detailROI = document.getElementById('detail-roi');
        this.detailHemi = document.getElementById('detail-hemi');
        this.detailAtlas = document.getElementById('detail-atlas');
        this.detailPosition = document.getElementById('detail-position');

        // Loading indicator
        this.loadingIndicator = document.getElementById('loading-indicator');
        this.loadingText = document.getElementById('loading-text');

        // Status bar
        this.statusText = document.getElementById('status-text');

        this._bindEvents();
        this._bindPanelToggle();
        this._populateCmapOptions();
    }

    // =========================================================================
    // Event binding
    // =========================================================================

    _bindEvents() {
        // Data type changes
        this.selReference.addEventListener('change', () => this._onReferenceChange());
        this.selDataType.addEventListener('change', () => this._onDataTypeChange());
        this.selDiffType.addEventListener('change', () => this._onDiffTypeChange());
        this.selDiffDirection.addEventListener('change', () => this._onSelectionChange());

        // Phase/Condition changes
        this.selPhase.addEventListener('change', () => this._onSelectionChange());
        this.selCondition.addEventListener('change', () => this._onSelectionChange());

        // Filter changes (multi-select handled in _buildMultiSelectItems)
        this.btnSubjectAll.addEventListener('click', () => this._setAllCheckboxes(this.subjectList, true));
        this.btnSubjectNone.addEventListener('click', () => this._setAllCheckboxes(this.subjectList, false));
        this.btnROIAll.addEventListener('click', () => this._setAllCheckboxes(this.roiList, true));
        this.btnROINone.addEventListener('click', () => this._setAllCheckboxes(this.roiList, false));
        this.selHemi.addEventListener('change', () => this._onFilterChange());
        this.chkSigOnly.addEventListener('change', () => this._onSigOnlyChange());

        // Sig Group controls
        this.chkSigGroup.addEventListener('change', () => this._onSigGroupToggle());
        this.sigGroupControls.querySelectorAll('input[name="sig-group-op"]').forEach(r => {
            r.addEventListener('change', () => this._onFilterChange());
        });

        // Color mode
        this.selColorMode.addEventListener('change', () => this._onColorModeChange());
        this.btnApplyHGAColor.addEventListener('click', () => this._onApplyHGAColor());

        // CLim mode toggle
        this.selClimMode.addEventListener('change', () => this._onClimModeChange());

        // Two-way cmap toggle
        this.chkTwoWayCmap.addEventListener('change', () => this._onTwoWayCmapChange());

        // View controls
        this.viewButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.app.renderer.setView(btn.dataset.view);
            });
        });

        // Clipping
        this.clipSlider.addEventListener('input', () => this._onClipChange());
        this.clipAxis.addEventListener('change', () => this._onClipChange());
    }

    _bindPanelToggle() {
        document.querySelectorAll('.panel-header[data-toggle]').forEach(header => {
            header.addEventListener('click', () => {
                const targetId = header.dataset.toggle;
                const body = document.getElementById(targetId);
                if (body) {
                    body.classList.toggle('collapsed');
                    header.classList.toggle('collapsed');
                }
            });
        });
    }

    // =========================================================================
    // Initialization
    // =========================================================================

    /**
     * Populate dropdowns from loaded data.
     */
    populateFromData(electrodesData, metadata) {
        // Reference dropdown (if metadata lists references)
        if (metadata.references && metadata.references.length > 0) {
            const refLabels = { car: 'CAR', bipolar: 'Bipolar' };
            this.selReference.innerHTML = '';
            for (const ref of metadata.references) {
                const opt = document.createElement('option');
                opt.value = ref;
                opt.textContent = refLabels[ref] || ref;
                this.selReference.appendChild(opt);
            }
            // Keep the current selection if it's still valid
            const dm = this.app.dataManager;
            if (dm && metadata.references.includes(dm.currentReference)) {
                this.selReference.value = dm.currentReference;
            }
        }

        // Subjects (multi-select checkboxes)
        this._buildMultiSelectItems(
            this.subjectList,
            electrodesData.subjects.map(s => ({
                value: s,
                label: `${s} (${electrodesData.subject_counts[s]})`,
            })),
            'subject'
        );

        // ROIs (multi-select checkboxes)
        const sortedROIs = Object.entries(electrodesData.roi_counts)
            .sort((a, b) => b[1] - a[1]);
        this._buildMultiSelectItems(
            this.roiList,
            sortedROIs.map(([roi, count]) => ({
                value: roi,
                label: `${roi} (${count})`,
            })),
            'roi'
        );

        // Update total count
        this.infoTotalCount.textContent = electrodesData.n_total;
        this.infoSubjectCount.textContent = electrodesData.subjects.length;

        // Populate diff direction based on initial diff type
        this._populateDiffDirections();
    }

    // =========================================================================
    // Colormap dropdown population
    // =========================================================================

    _populateCmapOptions() {
        const isTwoWay = this.chkTwoWayCmap.checked;
        const cmaps = isTwoWay
            ? BrainRenderer.DIVERGING_CMAPS
            : BrainRenderer.SEQUENTIAL_CMAPS;

        const prevValue = this.selHGACmap.value;
        this.selHGACmap.innerHTML = '';
        for (const name of cmaps) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            this.selHGACmap.appendChild(opt);
        }
        // Restore previous value if it's still in the list
        if (cmaps.includes(prevValue)) {
            this.selHGACmap.value = prevValue;
        }
    }

    // =========================================================================
    // Selection state
    // =========================================================================

    getSelection() {
        return {
            reference: this.selReference.value,
            dataType: this.selDataType.value,
            diffType: this.selDiffType.value,
            direction: this.selDiffDirection.value,
            phase: this.selPhase.value,
            condition: this.selCondition.value,
        };
    }

    getFilters() {
        return {
            subjects: this._getCheckedValues(this.subjectList),
            rois: this._getCheckedValues(this.roiList),
            hemi: this.selHemi.value,
            sigOnly: this.chkSigOnly.checked,
            sigGroup: this._getSigGroupSettings(),
        };
    }

    /**
     * Get sig group settings when active, or null when not.
     */
    _getSigGroupSettings() {
        if (!this.chkSigOnly.checked || !this.chkSigGroup.checked) return null;
        const selection = this.getSelection();
        const isDiff = selection.dataType === 'diff';

        const phases = this._getCheckedValuesRaw(this.sigGroupPhaseList);
        const op = this.sigGroupControls.querySelector('input[name="sig-group-op"]:checked').value;

        if (isDiff) {
            const directions = this._getCheckedValuesRaw(this.sigGroupDirectionList);
            const metadata = this.app.dataManager.metadata;
            const config = metadata && metadata.diff_types[selection.diffType];
            const conditions = (config && config.needs_condition)
                ? this._getCheckedValuesRaw(this.sigGroupConditionList)
                : null;
            return { phases, conditions, directions, op, isDiff, diffType: selection.diffType };
        } else {
            const conditions = this._getCheckedValuesRaw(this.sigGroupConditionList);
            return { phases, conditions, directions: null, op, isDiff, diffType: null };
        }
    }

    /** Get checked values array (always returns array, never null). */
    _getCheckedValuesRaw(container) {
        const checked = [];
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (cb.checked) checked.push(cb.value);
        });
        return checked;
    }

    /** Get array of checked values from a multi-select list container. */
    _getCheckedValues(container) {
        const boxes = container.querySelectorAll('input[type="checkbox"]');
        const total = boxes.length;
        const checked = [];
        boxes.forEach(cb => { if (cb.checked) checked.push(cb.value); });
        // Return null if all are selected (means "all", no filtering needed)
        return checked.length === total ? null : checked;
    }

    /** Build multi-select checkbox items inside container. */
    _buildMultiSelectItems(container, items, groupName) {
        container.innerHTML = '';
        for (const item of items) {
            const div = document.createElement('div');
            div.className = 'ms-item';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = item.value;
            cb.checked = true;
            cb.id = `ms-${groupName}-${item.value}`;
            cb.addEventListener('change', () => this._onFilterChange());
            const lbl = document.createElement('label');
            lbl.htmlFor = cb.id;
            lbl.textContent = item.label;
            div.appendChild(cb);
            div.appendChild(lbl);
            container.appendChild(div);
        }
    }

    /** Set all checkboxes in a container to checked/unchecked, then fire filter. */
    _setAllCheckboxes(container, checked) {
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = checked;
        });
        this._onFilterChange();
    }

    getClimSettings() {
        const mode = this.selClimMode.value;
        const twoWay = this.chkTwoWayCmap.checked;
        const cmap = this.selHGACmap.value;
        if (mode === 'percentile' || mode === 'percentile-current') {
            return {
                mode,
                pctMin: parseFloat(this.climPctMin.value),
                pctMax: parseFloat(this.climPctMax.value),
                twoWay,
                cmap,
            };
        } else {
            return {
                mode: 'absolute',
                absMin: parseFloat(this.climAbsMin.value),
                absMax: parseFloat(this.climAbsMax.value),
                twoWay,
                cmap,
            };
        }
    }

    // =========================================================================
    // Event handlers
    // =========================================================================

    async _onReferenceChange() {
        this.showLoading('Switching reference...');
        try {
            await this.app.switchReference(this.selReference.value);
        } finally {
            this.hideLoading();
        }
    }

    _onDataTypeChange() {
        const isDiff = this.selDataType.value === 'diff';
        this.diffTypeGroup.style.display = isDiff ? '' : 'none';
        this.diffDirectionGroup.style.display = isDiff ? '' : 'none';

        // Show/hide condition based on diff type
        this._updateConditionVisibility();
        this._populateDiffDirections();

        // Refresh sig group lists if active
        if (this.chkSigGroup.checked) {
            this._populateSigGroupLists();
        }

        this._onSelectionChange();
    }

    _onDiffTypeChange() {
        this._updateConditionVisibility();
        this._populateDiffDirections();

        // Refresh sig group direction list if active
        if (this.chkSigGroup.checked) {
            this._populateSigGroupLists();
        }

        this._onSelectionChange();
    }

    _updateConditionVisibility() {
        const dataType = this.selDataType.value;
        if (dataType === 'zscore') {
            this.conditionGroup.style.display = '';
        } else {
            // For diff, condition is only needed for lexicality/neighborhood
            const diffType = this.selDiffType.value;
            const metadata = this.app.dataManager.metadata;
            if (metadata && metadata.diff_types[diffType]) {
                this.conditionGroup.style.display = 
                    metadata.diff_types[diffType].needs_condition ? '' : 'none';
            }
        }
    }

    _populateDiffDirections() {
        const diffType = this.selDiffType.value;
        const metadata = this.app.dataManager.metadata;
        if (!metadata) return;

        const config = metadata.diff_types[diffType];
        if (!config) return;

        this.selDiffDirection.innerHTML = '';
        for (const dir of config.directions) {
            const opt = document.createElement('option');
            opt.value = dir;
            opt.textContent = dir;
            this.selDiffDirection.appendChild(opt);
        }
    }

    async _onSelectionChange() {
        this.showLoading('Loading data...');
        try {
            await this.app.loadAndUpdateHGA();
        } catch (e) {
            console.error('Error loading HGA data:', e);
            this.setStatus(`Error: ${e.message}`);
        }
        this.hideLoading();
    }

    _onFilterChange() {
        this.app.updateFilters();
    }

    /**
     * Show/hide the sig group section based on sig-only checkbox.
     */
    _onSigOnlyChange() {
        const sigOnly = this.chkSigOnly.checked;
        this.sigGroupSection.style.display = sigOnly ? '' : 'none';
        if (!sigOnly) {
            this.chkSigGroup.checked = false;
            this.sigGroupControls.style.display = 'none';
        }
        this._onFilterChange();
    }

    /**
     * Toggle the sig group multi-selects.
     * On enable: populate phase/condition/direction lists matching current selection.
     */
    _onSigGroupToggle() {
        const enabled = this.chkSigGroup.checked;
        this.sigGroupControls.style.display = enabled ? '' : 'none';
        if (enabled) {
            this._populateSigGroupLists();
        }
        this._onFilterChange();
    }

    /**
     * Populate sig group multi-select lists based on current data type.
     */
    _populateSigGroupLists() {
        const selection = this.getSelection();
        const isDiff = selection.dataType === 'diff';
        const phases = ['Cue', 'Stimulus', 'Delay', 'Response'];
        const conditions = ['Decision', 'Passive', 'Repeat'];

        // Phase list (always shown)
        this._buildSigGroupItems(this.sigGroupPhaseList, phases, 'sg-phase', selection.phase);

        if (isDiff) {
            const metadata = this.app.dataManager.metadata;
            const config = metadata && metadata.diff_types[selection.diffType];
            const directions = config ? config.directions : [];

            // Direction list (always for diff)
            this.sigGroupDirectionGroup.style.display = '';
            this._buildSigGroupItems(this.sigGroupDirectionList, directions, 'sg-dir', selection.direction);

            // Condition list (only for diff types that need condition)
            if (config && config.needs_condition) {
                this.sigGroupConditionGroup.style.display = '';
                this._buildSigGroupItems(this.sigGroupConditionList, conditions, 'sg-cond', selection.condition);
            } else {
                this.sigGroupConditionGroup.style.display = 'none';
            }
        } else {
            // For zscore: show condition list, hide direction list
            this.sigGroupConditionGroup.style.display = '';
            this.sigGroupDirectionGroup.style.display = 'none';
            this._buildSigGroupItems(this.sigGroupConditionList, conditions, 'sg-cond', selection.condition);
        }
    }

    /**
     * Build checkbox items for sig group multi-select.
     * Checks only the item matching `currentValue` by default.
     */
    _buildSigGroupItems(container, values, groupName, currentValue) {
        container.innerHTML = '';
        for (const val of values) {
            const div = document.createElement('div');
            div.className = 'ms-item';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = val;
            cb.checked = (val === currentValue);
            cb.id = `ms-${groupName}-${val}`;
            cb.addEventListener('change', () => this._onFilterChange());
            const lbl = document.createElement('label');
            lbl.htmlFor = cb.id;
            lbl.textContent = val;
            div.appendChild(cb);
            div.appendChild(lbl);
            container.appendChild(div);
        }
    }

    _onColorModeChange() {
        const mode = this.selColorMode.value;
        this.hgaColorControls.style.display = mode === 'hga' ? '' : 'none';

        if (mode === 'roi') {
            this.app.renderer.updateElectrodeColors('roi', this.app.dataManager);
        }
    }

    _onClimModeChange() {
        const mode = this.selClimMode.value;
        const isPct = mode === 'percentile' || mode === 'percentile-current';
        this.climPctControls.style.display = isPct ? '' : 'none';
        this.climAbsControls.style.display = mode === 'absolute' ? '' : 'none';
    }

    _onTwoWayCmapChange() {
        this._populateCmapOptions();
    }

    async _onApplyHGAColor() {
        const tMin = parseFloat(this.hgaTimeMin.value);
        const tMax = parseFloat(this.hgaTimeMax.value);
        const climSettings = this.getClimSettings();

        await this.app.applyHGAColoring(tMin, tMax, climSettings);
    }

    _onClipChange() {
        const value = parseInt(this.clipSlider.value);
        const axis = this.clipAxis.value;
        this.app.renderer.updateClipping(value, axis);
    }

    // =========================================================================
    // UI updates
    // =========================================================================

    updateInfoPanel(visibleCount, sigCount, filters) {
        this.infoVisibleCount.textContent = visibleCount;
        this.infoSigCount.textContent = sigCount !== null ? sigCount : '—';

        // Update subject count based on visible electrodes
        const electrodes = this.app.dataManager.getFilteredElectrodes(filters);
        const subjects = new Set(electrodes.map(e => e.subject));
        this.infoSubjectCount.textContent = subjects.size;
    }

    updateElectrodeDetail(electrode) {
        if (!electrode) {
            this.detailName.textContent = '—';
            this.detailSubject.textContent = '—';
            this.detailChannel.textContent = '—';
            this.detailROI.textContent = '—';
            this.detailHemi.textContent = '—';
            this.detailAtlas.textContent = '—';
            this.detailPosition.textContent = '—';
            this.infoSelected.textContent = 'None';
            return;
        }

        this.detailName.textContent = electrode.name;
        this.detailSubject.textContent = electrode.subject;
        this.detailChannel.textContent = electrode.channel;
        this.detailROI.textContent = electrode.roi;
        this.detailHemi.textContent = electrode.hemi === 'L' ? 'Left' : 'Right';
        this.detailAtlas.textContent = electrode.atlas_label || '—';

        if (electrode.x_fs != null) {
            this.detailPosition.textContent = 
                `(${electrode.x_fs.toFixed(1)}, ${electrode.y_fs.toFixed(1)}, ${electrode.z_fs.toFixed(1)})`;
        } else {
            this.detailPosition.textContent = 'N/A';
        }

        this.infoSelected.textContent = electrode.name;
    }

    setHGATimeRange(tMin, tMax, defaultMin = null, defaultMax = null) {
        this.hgaTimeMin.min = tMin.toFixed(2);
        this.hgaTimeMin.max = tMax.toFixed(2);
        this.hgaTimeMax.min = tMin.toFixed(2);
        this.hgaTimeMax.max = tMax.toFixed(2);
        this.hgaTimeMin.value = (defaultMin !== null ? defaultMin : tMin).toFixed(2);
        this.hgaTimeMax.value = (defaultMax !== null ? defaultMax : tMax).toFixed(2);
    }

    showLoading(text = 'Loading...') {
        this.loadingIndicator.style.display = 'flex';
        this.loadingText.textContent = text;
    }

    hideLoading() {
        this.loadingIndicator.style.display = 'none';
    }

    setStatus(text) {
        this.statusText.textContent = text;
    }
}
