/**
 * Data Manager — Handles loading and caching of all viewer data.
 * 
 * Loads JSON data files from the data/ directory. Supports lazy loading
 * with caching for sig and diff data.
 */
class DataManager {
    constructor(dataBasePath = 'data') {
        this.basePath = dataBasePath;
        this.cache = {};
        this.metadata = null;
        this.electrodes = null;
        this.brainMesh = null;
        this.roiAtlas = null;
        this.currentReference = 'car';
    }

    // =========================================================================
    // Health check
    // =========================================================================

    /**
     * Quick check that the data directory is accessible.
     * Returns true if metadata.json can be fetched, false otherwise.
     */
    async healthCheck() {
        try {
            const url = `${this.basePath}/metadata.json`;
            const response = await fetch(url, { method: 'HEAD' });
            return response.ok;
        } catch (e) {
            console.error('Data health check failed:', e);
            return false;
        }
    }

    // =========================================================================
    // Core loaders
    // =========================================================================

    async loadMetadata() {
        if (this.metadata) return this.metadata;
        this.metadata = await this._fetchJSON('metadata.json');
        return this.metadata;
    }

    async loadBrainMesh() {
        if (this.brainMesh) return this.brainMesh;
        this.brainMesh = await this._fetchJSON('brain_mesh.json');
        return this.brainMesh;
    }

    async loadROIAtlas() {
        if (this.roiAtlas) return this.roiAtlas;
        this.roiAtlas = await this._fetchJSON('roi_atlas.json');
        return this.roiAtlas;
    }

    async loadElectrodes() {
        const key = `electrodes_${this.currentReference}`;
        if (this.electrodes && this.electrodes._ref === this.currentReference) return this.electrodes;
        if (this.cache[key]) {
            this.electrodes = this.cache[key];
            return this.electrodes;
        }
        const data = await this._fetchJSON(`${this.currentReference}/electrodes.json`);
        data._ref = this.currentReference;
        this.cache[key] = data;
        this.electrodes = data;
        return this.electrodes;
    }

    // =========================================================================
    // Reference switching
    // =========================================================================

    /**
     * Set the active reference scheme and invalidate reference-specific caches.
     * @param {string} ref - 'car' or 'bipolar'
     */
    setReference(ref) {
        if (ref === this.currentReference) return;
        this.currentReference = ref;
        // Invalidate electrode cache so next load fetches the right file
        this.electrodes = null;
    }

    // =========================================================================
    // HGA data loaders (with caching)
    // =========================================================================

    /**
     * Load zscore data for a specific phase/condition.
     * Returns cached data if previously loaded.
     */
    async loadZscoreData(phase, condition) {
        const key = `${this.currentReference}/zscore/${phase}_${condition}`;
        if (this.cache[key]) return this.cache[key];

        const filename = `${this.currentReference}/zscore/${phase}_${condition}.json`;
        try {
            const data = await this._fetchJSON(filename);
            this.cache[key] = data;
            return data;
        } catch (e) {
            console.warn(`Could not load zscore data: ${filename}`, e);
            return null;
        }
    }

    /**
     * Load diff data for a specific diff type, direction, phase, and optionally condition.
     */
    async loadDiffData(diffType, direction, phase, condition = null) {
        let filename;
        if (condition) {
            filename = `${this.currentReference}/diff/${diffType}/${direction}_${phase}_${condition}.json`;
        } else {
            filename = `${this.currentReference}/diff/${diffType}/${direction}_${phase}.json`;
        }

        const key = filename;
        if (this.cache[key]) return this.cache[key];

        try {
            const data = await this._fetchJSON(filename);
            this.cache[key] = data;
            return data;
        } catch (e) {
            console.warn(`Could not load diff data: ${filename}`, e);
            return null;
        }
    }

    /**
     * Load the currently selected HGA data based on UI state.
     * @param {object} selection - {dataType, phase, condition, diffType, direction}
     */
    async loadHGAData(selection) {
        if (selection.dataType === 'zscore') {
            return this.loadZscoreData(selection.phase, selection.condition);
        } else if (selection.dataType === 'diff') {
            const diffConfig = this.metadata.diff_types[selection.diffType];
            if (diffConfig.needs_condition) {
                return this.loadDiffData(
                    selection.diffType,
                    selection.direction,
                    selection.phase,
                    selection.condition
                );
            } else {
                return this.loadDiffData(
                    selection.diffType,
                    selection.direction,
                    selection.phase
                );
            }
        }
        return null;
    }

    // =========================================================================
    // Electrode queries
    // =========================================================================

    /**
     * Get electrodes matching the current filter criteria.
     * @param {object} filters - {subject, roi, hemi}
     * @returns {Array} Filtered electrode objects
     */
    getFilteredElectrodes(filters = {}) {
        if (!this.electrodes) return [];

        let electrodes = this.electrodes.electrodes;

        if (filters.subjects) {
            const subSet = new Set(filters.subjects);
            electrodes = electrodes.filter(e => subSet.has(e.subject));
        }
        if (filters.rois) {
            const roiSet = new Set(filters.rois);
            electrodes = electrodes.filter(e => roiSet.has(e.roi));
        }
        if (filters.hemi && filters.hemi !== 'all') {
            electrodes = electrodes.filter(e => e.hemi === filters.hemi);
        }

        return electrodes;
    }

    /**
     * Get electrode by name.
     */
    getElectrodeByName(name) {
        if (!this.electrodes) return null;
        return this.electrodes.electrodes.find(e => e.name === name);
    }

    /**
     * Get the index of a channel name in the HGA data.
     * @param {object} hgaData - The loaded HGA data
     * @param {string} channelName - The electrode channel name
     * @returns {number} Index, or -1 if not found
     */
    getChannelIndex(hgaData, channelName) {
        if (!hgaData || !hgaData.channel_names) return -1;
        return hgaData.channel_names.indexOf(channelName);
    }

    /**
     * Get HGA trace data for specific electrodes.
     * Returns { times, data: [arrays], mean, sem, n }
     */
    getTraceData(hgaData, electrodeNames, dataKey = 'data') {
        if (!hgaData) return null;

        const times = hgaData.times;
        const allData = hgaData[dataKey];
        if (!allData) return null;

        // Find indices of requested electrodes
        const indices = [];
        for (const name of electrodeNames) {
            const idx = this.getChannelIndex(hgaData, name);
            if (idx >= 0) indices.push(idx);
        }

        if (indices.length === 0) return null;

        // Extract data rows
        const traces = indices.map(i => allData[i]);

        // Compute mean and SEM
        const n = traces.length;
        const nTimes = times.length;
        const mean = new Float64Array(nTimes);
        const sem = new Float64Array(nTimes);

        for (let t = 0; t < nTimes; t++) {
            let sum = 0;
            let count = 0;
            for (let i = 0; i < n; i++) {
                const v = traces[i][t];
                if (v !== null && !isNaN(v)) {
                    sum += v;
                    count++;
                }
            }
            mean[t] = count > 0 ? sum / count : 0;
        }

        if (n > 1) {
            for (let t = 0; t < nTimes; t++) {
                let sumSqDiff = 0;
                let count = 0;
                for (let i = 0; i < n; i++) {
                    const v = traces[i][t];
                    if (v !== null && !isNaN(v)) {
                        sumSqDiff += (v - mean[t]) ** 2;
                        count++;
                    }
                }
                if (count > 1) {
                    sem[t] = Math.sqrt(sumSqDiff / (count - 1)) / Math.sqrt(count);
                }
            }
        }

        return {
            times: times,
            traces: traces,
            mean: Array.from(mean),
            sem: Array.from(sem),
            n: n,
        };
    }

    /**
     * Get trial-level SEM for a single electrode.
     * Returns {times, data, sem, n_trials} or null.
     */
    getSingleElectrodeTrialData(hgaData, electrodeName, dataKey = 'data', semKey = 'trial_sem') {
        if (!hgaData) return null;
        const idx = this.getChannelIndex(hgaData, electrodeName);
        if (idx < 0) return null;

        const data = hgaData[dataKey] ? hgaData[dataKey][idx] : null;
        const trialSem = hgaData[semKey] ? hgaData[semKey][idx] : null;
        const nTrials = hgaData.n_trials ? hgaData.n_trials[idx] : null;

        if (!data) return null;

        return {
            times: hgaData.times,
            data: data,
            sem: trialSem,
            n_trials: nTrials,
        };
    }

    /**
     * Get the set of significant channel names from the current HGA data.
     * Uses sig_channels field populated from statistics.
     */
    getSigChannels(hgaData) {
        if (!hgaData) return null;
        if (hgaData.sig_channels && hgaData.sig_channels.length > 0) {
            return new Set(hgaData.sig_channels);
        }
        return null;
    }

    /**
     * Get the set of channel names that have data in the current HGA data.
     */
    getDataChannels(hgaData) {
        if (!hgaData || !hgaData.channel_names) return null;
        return new Set(hgaData.channel_names);
    }

    /**
     * Compute the intersection or union of sig_channels across multiple datasets.
     * @param {object} sigGroupSettings - {phases, conditions, directions, op, isDiff, diffType}
     * @returns {Promise<Set|null>} Combined sig channel set, or null on failure.
     */
    async computeSigGroup(sigGroupSettings) {
        const { phases, conditions, directions, op, isDiff, diffType } = sigGroupSettings;
        const sets = [];

        if (isDiff) {
            const config = this.metadata && this.metadata.diff_types[diffType];
            if (!config) return null;

            for (const phase of phases) {
                for (const dir of (directions || [])) {
                    if (config.needs_condition && conditions && conditions.length > 0) {
                        for (const cond of conditions) {
                            const data = await this.loadDiffData(diffType, dir, phase, cond);
                            if (data) {
                                const s = this.getSigChannels(data);
                                if (s) sets.push(s);
                            }
                        }
                    } else {
                        const data = await this.loadDiffData(diffType, dir, phase);
                        if (data) {
                            const s = this.getSigChannels(data);
                            if (s) sets.push(s);
                        }
                    }
                }
            }
        } else {
            for (const phase of phases) {
                for (const cond of (conditions || [])) {
                    const data = await this.loadZscoreData(phase, cond);
                    if (data) {
                        const s = this.getSigChannels(data);
                        if (s) sets.push(s);
                    }
                }
            }
        }

        if (sets.length === 0) return null;

        if (op === 'intersection') {
            let result = new Set(sets[0]);
            for (let i = 1; i < sets.length; i++) {
                result = new Set([...result].filter(x => sets[i].has(x)));
            }
            return result;
        } else {
            // union
            const result = new Set();
            for (const s of sets) {
                for (const x of s) result.add(x);
            }
            return result;
        }
    }

    // =========================================================================
    // Overall percentile (across all phases/conditions)
    // =========================================================================

    /**
     * Compute percentile CLim bounds by pooling HGA mean values across all
     * phase/condition (or phase/direction) combos for the given data type.
     * Each phase uses its own default analysis time window.
     *
     * @param {object} selection - Current UI selection {dataType, diffType, direction}
     * @param {Set} visibleNames - Set of visible electrode names
     * @param {number} pctMin - Lower percentile (0-100)
     * @param {number} pctMax - Upper percentile (0-100)
     * @returns {Promise<{vmin: number, vmax: number}|null>}
     */
    async computeOverallPercentileBounds(selection, visibleNames, pctMin, pctMax) {
        const phaseTimeDefaults = {
            'Cue':      { min: 0.0, max: 0.75 },
            'Stimulus': { min: 0.0, max: 0.75 },
            'Delay':    { min: 0.0, max: 0.5 },
            'Response': { min: -0.5, max: 0.5 },
        };
        const phases = this.metadata.phases;
        const conditions = this.metadata.conditions;
        const allVals = [];

        const collectMeans = (hgaData, tMin, tMax) => {
            if (!hgaData) return;
            const times = hgaData.times;
            const data = hgaData.data || hgaData.data_diff;
            if (!data || !times) return;

            let iMin = 0, iMax = times.length - 1;
            for (let i = 0; i < times.length; i++) {
                if (times[i] >= tMin) { iMin = i; break; }
            }
            for (let i = times.length - 1; i >= 0; i--) {
                if (times[i] <= tMax) { iMax = i; break; }
            }

            const chNames = hgaData.channel_names;
            for (let c = 0; c < chNames.length; c++) {
                if (!visibleNames.has(chNames[c])) continue;
                const row = data[c];
                if (!row) continue;
                let sum = 0, count = 0;
                for (let t = iMin; t <= iMax; t++) {
                    const v = row[t];
                    if (v !== null && !isNaN(v)) { sum += v; count++; }
                }
                if (count > 0) allVals.push(sum / count);
            }
        };

        if (selection.dataType === 'zscore') {
            for (const phase of phases) {
                const tw = phaseTimeDefaults[phase] || { min: 0, max: 1 };
                for (const cond of conditions) {
                    const d = await this.loadZscoreData(phase, cond);
                    collectMeans(d, tw.min, tw.max);
                }
            }
        } else if (selection.dataType === 'diff') {
            const config = this.metadata.diff_types[selection.diffType];
            if (!config) return null;
            const directions = config.directions;
            for (const phase of phases) {
                const tw = phaseTimeDefaults[phase] || { min: 0, max: 1 };
                for (const dir of directions) {
                    if (config.needs_condition) {
                        for (const cond of conditions) {
                            const d = await this.loadDiffData(selection.diffType, dir, phase, cond);
                            collectMeans(d, tw.min, tw.max);
                        }
                    } else {
                        const d = await this.loadDiffData(selection.diffType, dir, phase);
                        collectMeans(d, tw.min, tw.max);
                    }
                }
            }
        }

        if (allVals.length === 0) return null;

        const sorted = allVals.sort((a, b) => a - b);
        const pctIdx = (pct) => {
            const i = (pct / 100) * (sorted.length - 1);
            const lo = Math.floor(i);
            const hi = Math.ceil(i);
            if (lo === hi) return sorted[lo];
            return sorted[lo] + (i - lo) * (sorted[hi] - sorted[lo]);
        };
        return { vmin: pctIdx(pctMin), vmax: pctIdx(pctMax) };
    }

    // =========================================================================
    // ROI helpers
    // =========================================================================

    /**
     * Get color for a gross ROI label.
     * @returns {Array} [R, G, B] 0-255
     */
    getROIColor(roi) {
        if (!this.roiAtlas) return [180, 180, 180];
        const colors = this.roiAtlas.gross_roi_colors;
        if (colors[roi]) return colors[roi];
        // Check for special labels
        if (roi === 'Unknown' || roi === 'White-Matter') return [180, 180, 180];
        if (roi === 'Intersection') return [120, 120, 120];
        return [180, 180, 180];
    }

    /**
     * Get Three.js compatible color for an electrode based on its ROI.
     * @returns {THREE.Color}
     */
    getElectrodeColor(electrode) {
        const rgb = this.getROIColor(electrode.roi);
        return new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    }

    /**
     * Check if an electrode is in a "special" ROI (Unknown, White-Matter, Intersection).
     */
    isSpecialROI(roi) {
        return ['Unknown', 'White-Matter', 'Intersection'].includes(roi);
    }

    // =========================================================================
    // Internal
    // =========================================================================

    async _fetchJSON(relativePath) {
        const url = `${this.basePath}/${relativePath}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${url}`);
        }
        return response.json();
    }
}
