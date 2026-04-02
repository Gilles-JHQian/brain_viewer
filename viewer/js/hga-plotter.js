/**
 * HGA Plotter — Plotly.js based HGA trace visualization.
 *
 * Mirrors the style of Python's plot_hga_trace: mean line with SEM shading.
 * Supports single electrode, grouped (by subject/ROI), and diff mode plots.
 */
class HGAPlotter {
    constructor() {
        this.mainContainer = document.getElementById('hga-plot-main');
        this.diffContainer = document.getElementById('hga-plot-diff');
        this.infoContainer = document.getElementById('hga-plot-info');
        
        this.plotlyConfig = {
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
            displaylogo: false,
            responsive: true,
        };

        this.defaultLayout = {
            margin: { l: 45, r: 10, t: 25, b: 35 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(15,22,41,0.9)',
            font: { color: '#e0e0e0', size: 10 },
            xaxis: {
                title: { text: 'Time (s)', font: { size: 10 } },
                gridcolor: 'rgba(255,255,255,0.08)',
                zerolinecolor: 'rgba(255,255,255,0.2)',
                zerolinewidth: 1,
            },
            yaxis: {
                title: { text: 'HGA', font: { size: 10 } },
                gridcolor: 'rgba(255,255,255,0.08)',
                zerolinecolor: 'rgba(255,255,255,0.2)',
                zerolinewidth: 1,
            },
            showlegend: true,
            legend: { 
                font: { size: 9 },
                bgcolor: 'rgba(0,0,0,0.3)',
                x: 0.01, y: 0.99,
                xanchor: 'left', yanchor: 'top',
            },
        };
    }

    /**
     * Plot HGA trace for sig data.
     * @param {object} traceData - { times, mean, sem, n } from DataManager.getTraceData
     * @param {string} label - Label for the trace
     * @param {string} color - CSS color string
     * @param {string} title - Plot title
     */
    plotSigTrace(traceData, label = 'HGA', color = '#4fc3f7', title = '') {
        if (!traceData) {
            this._showInfo('No data available for current selection');
            return;
        }

        this.diffContainer.style.display = 'none';
        this.mainContainer.style.display = 'block';
        this.infoContainer.querySelector('span').textContent = 
            `${traceData.n} electrode(s)`;

        const traces = this._buildMeanSEMTraces(
            traceData.times, traceData.mean, traceData.sem, label, color
        );

        const layout = {
            ...this.defaultLayout,
            title: { text: title, font: { size: 11, color: '#a0a0b0' } },
        };

        Plotly.react(this.mainContainer, traces, layout, this.plotlyConfig);
    }

    /**
     * Plot single electrode trace for zscore data.
     * Shows trace with trial-level CI and significance shading.
     */
    plotSingleElectrode(hgaData, electrodeName, dataManager) {
        if (!hgaData) {
            this._showInfo('No HGA data loaded');
            return;
        }

        const idx = dataManager.getChannelIndex(hgaData, electrodeName);
        if (idx < 0) {
            this._showInfo(`Electrode ${electrodeName} not found in current data`);
            return;
        }

        this.diffContainer.style.display = 'none';
        this.mainContainer.style.display = 'block';
        this.infoContainer.querySelector('span').textContent = electrodeName;

        const times = hgaData.times;
        const data = hgaData.data[idx];
        const mask = hgaData.mask ? hgaData.mask[idx] : null;
        const trialSem = hgaData.trial_sem ? hgaData.trial_sem[idx] : null;
        const nTrials = hgaData.n_trials ? hgaData.n_trials[idx] : null;

        const traces = [];

        // Trial-level CI shading (95% CI = ±1.96 × SEM)
        if (trialSem) {
            const upper = data.map((v, i) => v !== null && trialSem[i] !== null ? v + 1.96 * trialSem[i] : null);
            const lower = data.map((v, i) => v !== null && trialSem[i] !== null ? v - 1.96 * trialSem[i] : null);

            traces.push({
                x: [...times, ...times.slice().reverse()],
                y: [...upper, ...lower.slice().reverse()],
                type: 'scatter',
                fill: 'toself',
                fillcolor: 'rgba(79,195,247,0.15)',
                line: { color: 'transparent' },
                name: `95% CI (n=${nTrials || '?'} trials)`,
                showlegend: true,
                hoverinfo: 'skip',
            });
        }

        // Main trace
        traces.push({
            x: times,
            y: data,
            type: 'scatter',
            mode: 'lines',
            name: electrodeName,
            line: { color: '#4fc3f7', width: 1.5 },
        });

        // Significance shading
        if (mask) {
            const sigY = data.map((v, i) => mask[i] === 1 ? v : null);
            traces.push({
                x: times,
                y: sigY,
                type: 'scatter',
                mode: 'lines',
                name: 'Significant',
                line: { color: '#ff9800', width: 2.5 },
                connectgaps: false,
            });
        }

        const layout = {
            ...this.defaultLayout,
            title: { text: electrodeName, font: { size: 11, color: '#a0a0b0' } },
        };

        Plotly.react(this.mainContainer, traces, layout, this.plotlyConfig);
    }

    /**
     * Plot diff data: two panels.
     * Top: act and bsl traces overlaid.
     * Bottom: difference trace.
     */
    plotDiffTraces(diffData, electrodeNames, dataManager, direction) {
        if (!diffData) {
            this._showInfo('No diff data available');
            return;
        }

        this.mainContainer.style.display = 'block';
        this.diffContainer.style.display = 'block';

        // Get trace data for act and bsl
        const actTrace = dataManager.getTraceData(diffData, electrodeNames, 'data_act');
        const bslTrace = dataManager.getTraceData(diffData, electrodeNames, 'data_bsl');
        const diffTrace = dataManager.getTraceData(diffData, electrodeNames, 'data_diff');

        if (!actTrace && !bslTrace && !diffTrace) {
            this._showInfo('No matching electrodes in diff data');
            return;
        }

        const n = diffTrace ? diffTrace.n : (actTrace ? actTrace.n : 0);
        this.infoContainer.querySelector('span').textContent = `${n} electrode(s)`;

        // Parse direction labels
        const labels = this._parseDirectionLabels(direction, diffData.diff_type);

        // ---- Top panel: Act & Bsl ----
        const topTraces = [];
        if (actTrace) {
            topTraces.push(...this._buildMeanSEMTraces(
                actTrace.times, actTrace.mean, actTrace.sem,
                labels.act, this._getConditionColor(labels.act)
            ));
        }
        if (bslTrace) {
            topTraces.push(...this._buildMeanSEMTraces(
                bslTrace.times, bslTrace.mean, bslTrace.sem,
                labels.bsl, this._getConditionColor(labels.bsl)
            ));
        }

        const topLayout = {
            ...this.defaultLayout,
            title: { text: `${labels.act} vs ${labels.bsl}`, font: { size: 11, color: '#a0a0b0' } },
            height: 190,
        };

        Plotly.react(this.mainContainer, topTraces, topLayout, this.plotlyConfig);

        // ---- Bottom panel: Difference ----
        if (diffTrace) {
            const bottomTraces = this._buildMeanSEMTraces(
                diffTrace.times, diffTrace.mean, diffTrace.sem,
                `Diff (${labels.act} - ${labels.bsl})`, '#ab47bc'
            );

            // Add zero line reference
            bottomTraces.push({
                x: [diffTrace.times[0], diffTrace.times[diffTrace.times.length - 1]],
                y: [0, 0],
                type: 'scatter',
                mode: 'lines',
                name: 'Zero',
                line: { color: 'rgba(255,255,255,0.3)', width: 1, dash: 'dash' },
                showlegend: false,
            });

            const bottomLayout = {
                ...this.defaultLayout,
                title: { text: 'Difference', font: { size: 11, color: '#a0a0b0' } },
                height: 190,
            };

            Plotly.react(this.diffContainer, bottomTraces, bottomLayout, this.plotlyConfig);
        }
    }

    /**
     * Plot diff data for a single electrode.
     */
    plotDiffSingleElectrode(diffData, electrodeName, dataManager, direction) {
        if (!diffData) {
            this._showInfo('No diff data loaded');
            return;
        }

        const idx = dataManager.getChannelIndex(diffData, electrodeName);
        if (idx < 0) {
            this._showInfo(`Electrode ${electrodeName} not found in diff data`);
            return;
        }

        this.mainContainer.style.display = 'block';
        this.diffContainer.style.display = 'block';
        this.infoContainer.querySelector('span').textContent = electrodeName;

        const times = diffData.times;
        const labels = this._parseDirectionLabels(direction, diffData.diff_type);

        const semAct = diffData.trial_sem_act ? diffData.trial_sem_act[idx] : null;
        const semBsl = diffData.trial_sem_bsl ? diffData.trial_sem_bsl[idx] : null;
        const semDiff = diffData.trial_sem_diff ? diffData.trial_sem_diff[idx] : null;
        const nAct = diffData.n_trials_act ? diffData.n_trials_act[idx] : null;
        const nBsl = diffData.n_trials_bsl ? diffData.n_trials_bsl[idx] : null;

        // Top: act and bsl with trial-level CI
        const topTraces = [];
        const actColor = this._getConditionColor(labels.act);
        const bslColor = this._getConditionColor(labels.bsl);

        if (semAct) {
            topTraces.push(...this._buildCIFill(times, diffData.data_act[idx], semAct, actColor, 0.12));
        }
        if (semBsl) {
            topTraces.push(...this._buildCIFill(times, diffData.data_bsl[idx], semBsl, bslColor, 0.12));
        }

        const actLabel = labels.act + (nAct != null ? ` (n=${nAct})` : '');
        const bslLabel = labels.bsl + (nBsl != null ? ` (n=${nBsl})` : '');

        topTraces.push(
            { x: times, y: diffData.data_act[idx], type: 'scatter', mode: 'lines', name: actLabel, line: { color: actColor, width: 1.5 } },
            { x: times, y: diffData.data_bsl[idx], type: 'scatter', mode: 'lines', name: bslLabel, line: { color: bslColor, width: 1.5 } },
        );

        const topLayout = {
            ...this.defaultLayout,
            title: { text: `${electrodeName}: ${labels.act} vs ${labels.bsl}`, font: { size: 11, color: '#a0a0b0' } },
            height: 190,
        };

        Plotly.react(this.mainContainer, topTraces, topLayout, this.plotlyConfig);

        // Bottom: diff with trial-level CI
        const bottomTraces = [];
        const diffColor = '#ab47bc';

        if (semDiff) {
            bottomTraces.push(...this._buildCIFill(times, diffData.data_diff[idx], semDiff, diffColor, 0.15));
        }

        bottomTraces.push(
            { x: times, y: diffData.data_diff[idx], type: 'scatter', mode: 'lines', name: 'Difference', line: { color: diffColor, width: 1.5 } },
            { x: [times[0], times[times.length - 1]], y: [0, 0], type: 'scatter', mode: 'lines', name: 'Zero', line: { color: 'rgba(255,255,255,0.3)', width: 1, dash: 'dash' }, showlegend: false },
        );

        // Significance mask on diff trace
        const mask = diffData.mask ? diffData.mask[idx] : null;
        if (mask) {
            const sigY = diffData.data_diff[idx].map((v, i) => mask[i] === 1 ? v : null);
            bottomTraces.push({
                x: times, y: sigY,
                type: 'scatter', mode: 'lines',
                name: 'Significant',
                line: { color: '#ff9800', width: 2.5 },
                connectgaps: false,
            });
        }

        const bottomLayout = {
            ...this.defaultLayout,
            title: { text: 'Difference', font: { size: 11, color: '#a0a0b0' } },
            height: 190,
        };

        Plotly.react(this.diffContainer, bottomTraces, bottomLayout, this.plotlyConfig);
    }

    /**
     * Clear all plots.
     */
    clear() {
        Plotly.purge(this.mainContainer);
        Plotly.purge(this.diffContainer);
        this.diffContainer.style.display = 'none';
        this._showInfo('Click an electrode or select filters to view HGA trace');
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    _buildMeanSEMTraces(times, mean, sem, label, color) {
        const traces = [];

        // SEM upper bound
        const upper = mean.map((m, i) => m + sem[i]);
        const lower = mean.map((m, i) => m - sem[i]);

        // SEM fill
        traces.push({
            x: [...times, ...times.slice().reverse()],
            y: [...upper, ...lower.slice().reverse()],
            type: 'scatter',
            fill: 'toself',
            fillcolor: this._toRGBA(color, 0.15),
            line: { color: 'transparent' },
            name: `${label} SEM`,
            showlegend: false,
            hoverinfo: 'skip',
        });

        // Mean line
        traces.push({
            x: times,
            y: mean,
            type: 'scatter',
            mode: 'lines',
            name: label,
            line: { color: color, width: 1.5 },
        });

        return traces;
    }

    /**
     * Build 95% CI fill traces (mean ± 1.96 × SEM).
     * Returns just the fill polygon (no mean line).
     */
    _buildCIFill(times, data, sem, color, opacity) {
        const upper = data.map((v, i) => v !== null && sem[i] !== null ? v + 1.96 * sem[i] : null);
        const lower = data.map((v, i) => v !== null && sem[i] !== null ? v - 1.96 * sem[i] : null);
        return [{
            x: [...times, ...times.slice().reverse()],
            y: [...upper, ...lower.slice().reverse()],
            type: 'scatter',
            fill: 'toself',
            fillcolor: this._toRGBA(color, opacity),
            line: { color: 'transparent' },
            showlegend: false,
            hoverinfo: 'skip',
        }];
    }

    _parseDirectionLabels(direction, diffType) {
        const labels = {
            DecRep: { act: 'Decision', bsl: 'Repeat' },
            RepDec: { act: 'Repeat', bsl: 'Decision' },
            NwWd:   { act: 'Nonword', bsl: 'Word' },
            WdNw:   { act: 'Word', bsl: 'Nonword' },
            HdLd:   { act: 'High Density', bsl: 'Low Density' },
            LdHd:   { act: 'Low Density', bsl: 'High Density' },
        };
        return labels[direction] || { act: 'Group A', bsl: 'Group B' };
    }

    /**
     * Get consistent color for a condition label, regardless of act/bsl role.
     * E.g. "Nonword" is always red, "Word" always blue, etc.
     */
    _getConditionColor(label) {
        const colorMap = {
            'Decision':     '#e53935',  // red
            'Repeat':       '#1e88e5',  // blue
            'Nonword':      '#e53935',  // red
            'Word':         '#1e88e5',  // blue
            'High Density': '#e53935',  // red
            'Low Density':  '#1e88e5',  // blue
        };
        return colorMap[label] || '#4fc3f7';
    }

    _showInfo(text) {
        this.infoContainer.querySelector('span').textContent = text;
    }

    /**
     * Convert any CSS color (hex or rgb) to rgba with given alpha.
     */
    _toRGBA(color, alpha) {
        if (color.startsWith('#')) {
            const hex = color.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return `rgba(${r},${g},${b},${alpha})`;
        }
        if (color.startsWith('rgb(')) {
            return color.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
        }
        return color;
    }
}
