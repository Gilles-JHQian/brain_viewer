/**
 * App — Main application entry point.
 *
 * Orchestrates DataManager, BrainRenderer, HGAPlotter, UIControls,
 * and SettingsManager to create the interactive brain viewer.
 */
class BrainViewerApp {
    constructor() {
        this.dataManager = new DataManager('data');
        this.renderer = null;
        this.hgaPlotter = null;
        this.ui = null;
        this.settingsManager = null;
        this.exportManager = null;

        // Cached state
        this.currentHGAData = null;
        this.currentElectrodes = [];  // All electrodes from JSON
        this.visibleElectrodes = [];  // Currently visible (after filtering)
        this.brainMeshData = null;
        this.roiAtlasData = null;
    }

    async init() {
        console.log('Brain Viewer initializing...');
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingMsg = document.getElementById('loading-msg');

        const setLoadMsg = (msg) => {
            console.log(msg);
            if (loadingMsg) loadingMsg.textContent = msg;
        };

        try {
            // Initialize renderer
            setLoadMsg('Initializing 3D renderer...');
            const canvas = document.getElementById('brain-canvas');
            this.renderer = new BrainRenderer(canvas);

            // Initialize UI
            this.ui = new UIControls(this);
            this.settingsManager = new SettingsManager(this);
            this.hgaPlotter = new HGAPlotter();
            this.exportManager = new ExportManager(this);

            // Set up electrode click handler
            this.renderer.onElectrodeClick = (name) => this._onElectrodeClick(name);

            // -------- Data health check --------
            setLoadMsg('Checking data availability...');
            const dataOK = await this.dataManager.healthCheck();
            if (!dataOK) {
                this._showDataError();
                return;
            }

            // -------- Load core data --------
            setLoadMsg('Loading metadata...');
            await this.dataManager.loadMetadata();

            setLoadMsg('Loading brain mesh (may take a few seconds)...');
            this.brainMeshData = await this.dataManager.loadBrainMesh();

            setLoadMsg('Loading ROI atlas...');
            this.roiAtlasData = await this.dataManager.loadROIAtlas();

            setLoadMsg('Loading electrode data...');
            const electrodesData = await this.dataManager.loadElectrodes();
            this.currentElectrodes = electrodesData.electrodes;

            // Populate UI dropdowns
            this.ui.populateFromData(electrodesData, this.dataManager.metadata);

            // Build brain mesh
            setLoadMsg('Building 3D scene...');
            this.renderer.buildBrainMesh(this.brainMeshData, this.roiAtlasData);

            // Build electrodes
            setLoadMsg(`Building ${this.currentElectrodes.length} electrodes...`);
            this.renderer.buildElectrodes(this.currentElectrodes, this.dataManager);

            // Sync HTML default settings → renderer
            this.settingsManager.applyAll();

            // Apply initial filters
            await this.updateFilters();

            // Load initial HGA data (zscore, Stimulus, Decision)
            setLoadMsg('Loading HGA data...');
            await this.loadAndUpdateHGA();

            // Hide loading overlay
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            this.ui.setStatus('Ready — Click electrodes to inspect');

            console.log('Brain Viewer initialized successfully');

        } catch (error) {
            console.error('Initialization error:', error);
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            this._showError('Initialization Error', error.message);
        }
    }

    /**
     * Show a prominent error overlay when data directory is missing.
     */
    _showDataError() {
        const overlay = document.getElementById('error-overlay');
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        if (!overlay) return;
        overlay.innerHTML = `
            <div class="error-content">
                <h2>Data Not Found</h2>
                <p>Could not load <code>data/metadata.json</code>.<br>
                   The <code>data/</code> folder is missing or inaccessible.</p>
                <p><strong>How to fix:</strong></p>
                <p>Make sure you have the <code>brain_viewer_data/</code> folder
                   next to the <code>viewer/</code> folder, then use the start script:</p>
                <pre>your_folder/
  viewer/          ← this folder
  brain_viewer_data/
    metadata.json
    brain_mesh.json
    electrodes.json
    roi_atlas.json
    sig/
    diff/</pre>
                <p>Then run:</p>
                <pre>cd viewer
bash start_viewer.sh</pre>
                <p style="color:#a0a0b0;font-size:12px;margin-top:20px;">
                    Or manually: copy/symlink <code>brain_viewer_data</code> as <code>viewer/data</code>,
                    then run <code>python3 -m http.server 8080</code> inside <code>viewer/</code>.
                </p>
            </div>`;
        overlay.style.display = 'flex';
    }

    /**
     * Show a generic error overlay.
     */
    _showError(title, message) {
        const overlay = document.getElementById('error-overlay');
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        if (!overlay) return;
        overlay.innerHTML = `
            <div class="error-content">
                <h2>${title}</h2>
                <p>${message}</p>
                <p style="color:#a0a0b0;font-size:12px;margin-top:16px;">Check the browser console (F12) for details.</p>
            </div>`;
        overlay.style.display = 'flex';
        if (this.ui) this.ui.setStatus(`Error: ${message}`);
    }

    // =========================================================================
    // Data loading and HGA updates
    // =========================================================================

    /**
     * Load HGA data for the current selection and update plots.
     */
    async loadAndUpdateHGA() {
        const selection = this.ui.getSelection();

        this.currentHGAData = await this.dataManager.loadHGAData(selection);

        if (this.currentHGAData) {
            // Update time range for HGA color controls
            const times = this.currentHGAData.times;
            const phase = selection.phase;
            const phaseDefaults = {
                'Cue':      { min: 0.0, max: 0.75 },
                'Stimulus': { min: 0.0, max: 0.75 },
                'Response': { min: -0.5, max: 0.5 },
            };
            const defaults = phaseDefaults[phase];
            this.ui.setHGATimeRange(
                times[0], times[times.length - 1],
                defaults ? defaults.min : null,
                defaults ? defaults.max : null
            );

            // Update status
            const n = this.currentHGAData.n_electrodes;
            const nSig = this.currentHGAData.sig_channels
                ? this.currentHGAData.sig_channels.length : 0;
            this.ui.setStatus(
                `Loaded: ${selection.dataType} | ${selection.phase} | ` +
                `${selection.condition || selection.direction} | ` +
                `${n} electrodes (${nSig} sig)`
            );
        } else {
            this.ui.setStatus('No data available for current selection');
        }

        // Re-apply filters (sig-only may change with new data)
        await this.updateFilters();

        // Update HGA plot
        this._updateHGAPlot();
    }

    // =========================================================================
    // Filter updates
    // =========================================================================

    /**
     * Apply filters and update electrode visibility + info panel + HGA plot.
     */
    async updateFilters() {
        const filters = this.ui.getFilters();
        let filtered = this.dataManager.getFilteredElectrodes(filters);

        // Always filter to electrodes that have data in the current dataset
        const dataChannels = this.dataManager.getDataChannels(this.currentHGAData);
        if (dataChannels) {
            filtered = filtered.filter(e => dataChannels.has(e.name));
        }

        // Determine sig names: from sig group (cross-condition) or current data
        let sigNames = null;
        if (filters.sigGroup) {
            // Sig group mode: compute intersection/union across selected combos
            sigNames = await this.dataManager.computeSigGroup(filters.sigGroup);
        } else if (this.currentHGAData) {
            sigNames = this.dataManager.getSigChannels(this.currentHGAData);
        }

        // Compute sig electrode count (before sig-only filtering)
        let sigCount = null;
        if (sigNames) {
            sigCount = filtered.filter(e => sigNames.has(e.name)).length;
        }

        // Apply sig-only filter
        if (filters.sigOnly && sigNames) {
            filtered = filtered.filter(e => sigNames.has(e.name));
        }

        this.visibleElectrodes = filtered;

        // Build set of visible names
        const visibleNames = new Set(filtered.map(e => e.name));
        this.renderer.updateElectrodeVisibility(visibleNames);

        // Update info panel
        this.ui.updateInfoPanel(filtered.length, sigCount, filters);

        // Update HGA plot (aggregate for visible electrodes)
        this._updateHGAPlot();
    }

    // =========================================================================
    // HGA coloring
    // =========================================================================

    /**
     * Apply HGA-value based electrode coloring.
     * @param {number} tMin - start time (s)
     * @param {number} tMax - end time (s)
     * @param {object} climSettings - { mode, pctMin?, pctMax?, absMin?, absMax?, twoWay, cmap }
     */
    async applyHGAColoring(tMin, tMax, climSettings) {
        if (!this.currentHGAData) {
            this.ui.setStatus('Load HGA data first');
            return;
        }

        const times = this.currentHGAData.times;
        const data = this.currentHGAData.data || this.currentHGAData.data_diff;
        if (!data) return;

        // Find time indices
        let iMin = 0, iMax = times.length - 1;
        for (let i = 0; i < times.length; i++) {
            if (times[i] >= tMin) { iMin = i; break; }
        }
        for (let i = times.length - 1; i >= 0; i--) {
            if (times[i] <= tMax) { iMax = i; break; }
        }

        // Compute mean HGA value for each electrode in the time window
        const channelNames = this.currentHGAData.channel_names;
        const hgaValues = {};

        for (let i = 0; i < channelNames.length; i++) {
            const row = data[i];
            if (!row) continue;
            let sum = 0, count = 0;
            for (let t = iMin; t <= iMax; t++) {
                const v = row[t];
                if (v !== null && !isNaN(v)) {
                    sum += v;
                    count++;
                }
            }
            hgaValues[channelNames[i]] = count > 0 ? sum / count : null;
        }

        // Compute vmin, vmax based on clim settings
        const vals = Object.values(hgaValues).filter(v => v !== null && !isNaN(v));
        if (vals.length === 0) {
            this.ui.setStatus('No valid HGA values in the selected time window');
            return;
        }

        let vmin, vmax;
        if (climSettings.mode === 'percentile') {
            // Overall: pool values across all phases/conditions
            const visibleNames = new Set(
                (this.visibleElectrodes || []).map(e => e.name)
            );
            const selection = this.ui.getSelection();
            const bounds = await this.dataManager.computeOverallPercentileBounds(
                selection, visibleNames, climSettings.pctMin, climSettings.pctMax
            );
            if (!bounds) {
                this.ui.setStatus('Could not compute overall percentile bounds');
                return;
            }
            vmin = bounds.vmin;
            vmax = bounds.vmax;
        } else if (climSettings.mode === 'percentile-current') {
            const sorted = [...vals].sort((a, b) => a - b);
            const pctIdx = (pct) => {
                const i = (pct / 100) * (sorted.length - 1);
                const lo = Math.floor(i);
                const hi = Math.ceil(i);
                if (lo === hi) return sorted[lo];
                return sorted[lo] + (i - lo) * (sorted[hi] - sorted[lo]);
            };
            vmin = pctIdx(climSettings.pctMin);
            vmax = pctIdx(climSettings.pctMax);
        } else {
            // absolute
            vmin = climSettings.absMin;
            vmax = climSettings.absMax;
        }

        // For two-way, make symmetric: use -maxAbs, +maxAbs
        if (climSettings.twoWay) {
            const maxAbs = Math.max(Math.abs(vmin), Math.abs(vmax));
            vmin = -maxAbs;
            vmax = maxAbs;
        }

        this.renderer.updateElectrodeColors(
            'hga', this.dataManager, hgaValues, climSettings.cmap, vmin, vmax
        );
        this.ui.setStatus(
            `HGA coloring applied (t=${tMin.toFixed(2)}–${tMax.toFixed(2)}s, ` +
            `clim=[${vmin.toFixed(3)}, ${vmax.toFixed(3)}])`
        );
    }

    // =========================================================================
    // Brain mesh rebuild (for ROI surface toggle)
    // =========================================================================

    rebuildBrainMesh() {
        if (this.brainMeshData && this.roiAtlasData) {
            this.renderer.buildBrainMesh(this.brainMeshData, this.roiAtlasData);
        }
    }

    // =========================================================================
    // Electrode click handler
    // =========================================================================

    _onElectrodeClick(name) {
        if (name === null) {
            // Deselect
            this.renderer.clearHighlight();
            this.ui.updateElectrodeDetail(null);
            // Revert to aggregate plot
            this._updateHGAPlot();
            return;
        }

        // Highlight electrode
        this.renderer.highlightElectrode(name);

        // Update detail panel
        const electrode = this.dataManager.getElectrodeByName(name);
        this.ui.updateElectrodeDetail(electrode);

        // Plot single electrode HGA trace
        this._plotSingleElectrode(name);
    }

    // =========================================================================
    // HGA plotting helpers
    // =========================================================================

    _updateHGAPlot() {
        if (!this.currentHGAData) {
            this.hgaPlotter.clear();
            return;
        }

        // If an electrode is selected, plot that single electrode
        if (this.renderer.selectedElectrode) {
            this._plotSingleElectrode(this.renderer.selectedElectrode);
            return;
        }

        // Otherwise, plot aggregate for visible electrodes
        const visibleNames = this.visibleElectrodes.map(e => e.name);

        const selection = this.ui.getSelection();
        const filters = this.ui.getFilters();

        // Build title
        let title = `${selection.phase}`;
        if (selection.dataType === 'zscore') {
            title += ` | ${selection.condition}`;
        } else {
            title += ` | ${selection.direction}`;
            if (selection.condition && this.dataManager.metadata.diff_types[selection.diffType]?.needs_condition) {
                title += ` | ${selection.condition}`;
            }
        }
        if (filters.subjects) {
            title += filters.subjects.length === 1
                ? ` | ${filters.subjects[0]}`
                : ` | ${filters.subjects.length} subjects`;
        }
        if (filters.rois) {
            title += filters.rois.length === 1
                ? ` | ${filters.rois[0]}`
                : ` | ${filters.rois.length} ROIs`;
        }

        if (selection.dataType === 'zscore') {
            const traceData = this.dataManager.getTraceData(
                this.currentHGAData, visibleNames, 'data'
            );
            this.hgaPlotter.plotSigTrace(traceData, 'Mean HGA', '#4fc3f7', title);
        } else {
            this.hgaPlotter.plotDiffTraces(
                this.currentHGAData, visibleNames, this.dataManager,
                selection.direction
            );
        }
    }

    _plotSingleElectrode(name) {
        if (!this.currentHGAData) return;

        const selection = this.ui.getSelection();

        if (selection.dataType === 'zscore') {
            this.hgaPlotter.plotSingleElectrode(
                this.currentHGAData, name, this.dataManager
            );
        } else {
            this.hgaPlotter.plotDiffSingleElectrode(
                this.currentHGAData, name, this.dataManager,
                selection.direction
            );
        }
    }
}

// =============================================================================
// Initialize on DOM ready
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Check for file:// protocol (fetch won't work without HTTP server)
    if (window.location.protocol === 'file:') {
        document.body.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;
                        width:100%;height:100vh;background:#1a1a2e;color:#e0e0e0;
                        font-family:sans-serif;text-align:center;padding:40px;">
                <div>
                    <h1 style="color:#ff6b6b;margin-bottom:20px;">Cannot open directly as a file</h1>
                    <p style="font-size:16px;line-height:1.8;color:#a0a0b0;max-width:600px;">
                        The Brain Viewer needs a local HTTP server to load data files.<br>
                        Please run the following command in the <code style="background:#0f1629;padding:2px 8px;border-radius:4px;">viewer/</code> folder:
                    </p>
                    <pre style="background:#0f1629;padding:16px 24px;border-radius:8px;
                                margin:20px auto;display:inline-block;text-align:left;
                                font-size:15px;color:#4fc3f7;">
bash start_viewer.sh\n\n# or manually:\npython3 -m http.server 8080</pre>
                    <p style="font-size:14px;color:#a0a0b0;margin-top:16px;">
                        Then open <a href="http://localhost:8080" style="color:#4fc3f7;">http://localhost:8080</a>
                    </p>
                </div>
            </div>`;
        return;
    }

    const app = new BrainViewerApp();
    app.init();
});
