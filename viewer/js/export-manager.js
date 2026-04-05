/**
 * Export Manager — Batch export for HGA traces and brain plots.
 *
 * Provides a popup modal with two tabs:
 *   1. Trace Export: configurable phase×condition grid using Plotly subplots.
 *   2. Brain Plot Export: screenshot of the 3D brain with HGA-colored electrodes.
 *
 * Supports save-to-file and copy-to-clipboard.
 */
class ExportManager {
    constructor(app) {
        this.app = app;

        // DOM
        this.modal = document.getElementById('export-modal');
        this.btnOpen = document.getElementById('btn-export');
        this.btnClose = document.getElementById('btn-close-export');
        this.tabs = this.modal.querySelectorAll('.export-tab-btn');
        this.panels = this.modal.querySelectorAll('.export-tab-panel');

        // Trace tab elements
        this.tracePreview = document.getElementById('export-trace-preview');
        this.traceWidth = document.getElementById('export-trace-width');
        this.traceHeight = document.getElementById('export-trace-height');
        this.traceScale = document.getElementById('export-trace-scale');
        this.traceFormat = document.getElementById('export-trace-format');
        this.traceYMin = document.getElementById('export-trace-ymin');
        this.traceYMax = document.getElementById('export-trace-ymax');
        this.traceYAuto = document.getElementById('export-trace-yauto');
        this.traceVenn = document.getElementById('export-trace-venn');
        this.traceVennDim = document.getElementById('export-trace-venn-dim');
        this.traceVennDimGroup = document.getElementById('trace-venn-dim-group');
        this.tracePhasesContainer = document.getElementById('export-trace-phases');
        this.btnTraceGenerate = document.getElementById('btn-trace-generate');
        this.btnTraceSave = document.getElementById('btn-trace-save');
        this.btnTraceCopy = document.getElementById('btn-trace-copy');

        // Brain tab elements
        this.brainPreview = document.getElementById('export-brain-preview');
        this.brainWidth = document.getElementById('export-brain-width');
        this.brainHeight = document.getElementById('export-brain-height');
        this.brainScale = document.getElementById('export-brain-scale');
        this.brainFormat = document.getElementById('export-brain-format');
        this.brainView = document.getElementById('export-brain-view');
        this.brainBgColor = document.getElementById('export-brain-bg');
        this.brainProjectToSurface = document.getElementById('export-brain-project');
        this.btnBrainGenerate = document.getElementById('btn-brain-generate');
        this.btnBrainSave = document.getElementById('btn-brain-save');
        this.btnBrainCopy = document.getElementById('btn-brain-copy');

        // Venn tab elements
        this.vennPreview = document.getElementById('export-venn-preview');
        this.vennDataSource = document.getElementById('venn-data-source');
        this.vennDiffType = document.getElementById('venn-diff-type');
        this.vennDiffTypeGroup = document.getElementById('venn-diff-type-group');
        this.vennDimPhase = document.getElementById('venn-dim-phase');
        this.vennDimCondition = document.getElementById('venn-dim-condition');
        this.vennDimDirection = document.getElementById('venn-dim-direction');
        this.vennDimDirectionLabel = document.getElementById('venn-dim-direction-label');
        this.vennWidth = document.getElementById('venn-width');
        this.vennHeight = document.getElementById('venn-height');
        this.vennScale = document.getElementById('venn-scale');
        this.vennBgColor = document.getElementById('venn-bg-color');
        this.btnVennGenerate = document.getElementById('btn-venn-generate');
        this.btnVennSave = document.getElementById('btn-venn-save');
        this.btnVennCopy = document.getElementById('btn-venn-copy');

        // Venn filter/circles containers
        this.vennFilterPhaseGroup = document.getElementById('venn-filter-phase-group');
        this.vennFilterConditionGroup = document.getElementById('venn-filter-condition-group');
        this.vennFilterDirectionGroup = document.getElementById('venn-filter-direction-group');
        this.vennFilterPhaseList = document.getElementById('venn-filter-phase-list');
        this.vennFilterConditionList = document.getElementById('venn-filter-condition-list');
        this.vennFilterDirectionList = document.getElementById('venn-filter-direction-list');
        this.vennCirclesPhaseGroup = document.getElementById('venn-circles-phase-group');
        this.vennCirclesConditionGroup = document.getElementById('venn-circles-condition-group');
        this.vennCirclesDirectionGroup = document.getElementById('venn-circles-direction-group');
        this.vennCirclesPhaseList = document.getElementById('venn-circles-phase-list');
        this.vennCirclesConditionList = document.getElementById('venn-circles-condition-list');
        this.vennCirclesDirectionList = document.getElementById('venn-circles-direction-list');

        // State
        this._traceCanvas = null;
        this._brainCanvas = null;
        this._vennCanvas = null;
        this._vennDiagram = new VennDiagram();

        this._bindEvents();
    }

    // =========================================================================
    // Event binding
    // =========================================================================

    _bindEvents() {
        this.btnOpen.addEventListener('click', () => this.open());
        this.btnClose.addEventListener('click', () => this.close());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        // Tab switching
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => this._switchTab(tab.dataset.tab));
        });

        // Trace controls
        this.btnTraceGenerate.addEventListener('click', () => this._generateTraces());
        this.btnTraceSave.addEventListener('click', () => this._saveTrace());
        this.btnTraceCopy.addEventListener('click', () => this._copyTrace());
        this.traceYAuto.addEventListener('change', () => {
            const disabled = this.traceYAuto.checked;
            this.traceYMin.disabled = disabled;
            this.traceYMax.disabled = disabled;
        });
        this.traceVenn.addEventListener('change', () => {
            this.traceVennDimGroup.style.display = this.traceVenn.checked ? '' : 'none';
        });

        // Brain controls
        this.btnBrainGenerate.addEventListener('click', () => this._generateBrainPlot());
        this.btnBrainSave.addEventListener('click', () => this._saveBrain());
        this.btnBrainCopy.addEventListener('click', () => this._copyBrain());

        // Venn controls
        this.vennDataSource.addEventListener('change', () => this._onVennDataSourceChange());
        this.vennDiffType.addEventListener('change', () => this._onVennDiffTypeChange());
        this.vennDimPhase.addEventListener('change', () => this._onVennDimChange());
        this.vennDimCondition.addEventListener('change', () => this._onVennDimChange());
        this.vennDimDirection.addEventListener('change', () => this._onVennDimChange());
        this.btnVennGenerate.addEventListener('click', () => this._generateVenn());
        this.btnVennSave.addEventListener('click', () => this._saveVenn());
        this.btnVennCopy.addEventListener('click', () => this._copyVenn());
    }

    // =========================================================================
    // Modal open/close
    // =========================================================================

    open() {
        this.modal.style.display = 'flex';
    }

    close() {
        this.modal.style.display = 'none';
    }

    // =========================================================================
    // Tab switching
    // =========================================================================

    _switchTab(tabId) {
        this.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
        this.panels.forEach(p => p.classList.toggle('active', p.id === `export-panel-${tabId}`));
    }

    // =========================================================================
    // TRACE EXPORT
    // =========================================================================

    /**
     * Generate the trace grid.
     * Phases are selected via checkboxes; conditions default to (Decision, Repeat).
     * For sig/zscore: rows = conditions, cols = selected phases.
     * For diff: same layout but with act/bsl overlay + diff panel (extra rows).
     */
    async _generateTraces() {
        this.btnTraceGenerate.disabled = true;
        this.btnTraceGenerate.textContent = 'Generating...';
        this.tracePreview.innerHTML = '<div class="export-loading">Loading data...</div>';

        try {
            const selection = this.app.ui.getSelection();
            const filters = this.app.ui.getFilters();
            // Get base filtered electrodes (subject/ROI/hemi but NOT sig-only)
            const baseFilters = { ...filters, sigOnly: false };
            const baseFilteredNames = this.app.dataManager.getFilteredElectrodes(baseFilters).map(e => e.name);

            const phases = Array.from(this.tracePhasesContainer.querySelectorAll('input:checked')).map(cb => cb.value);
            if (phases.length === 0) {
                this.tracePreview.innerHTML = '<div class="export-error">Please select at least one phase.</div>';
                this.btnTraceGenerate.disabled = false;
                this.btnTraceGenerate.textContent = 'Generate';
                return;
            }
            const conditions = ['Decision', 'Repeat'];
            const isDiff = selection.dataType === 'diff';

            const width = parseInt(this.traceWidth.value) || 1200;
            const height = parseInt(this.traceHeight.value) || 800;
            const scale = parseFloat(this.traceScale?.value) || 1.0;
            const clampedScale = Math.max(0.5, Math.min(scale, 5));
            const yAuto = this.traceYAuto.checked;
            const yMin = parseFloat(this.traceYMin.value);
            const yMax = parseFloat(this.traceYMax.value);
            const showVenn = this.traceVenn.checked;
            const vennDim = this.traceVennDim.value; // 'row' or 'col'

            // Create a temporary div for Plotly
            const plotDiv = document.createElement('div');
            plotDiv.style.width = width + 'px';
            plotDiv.style.height = height + 'px';
            plotDiv.style.position = 'absolute';
            plotDiv.style.left = '-9999px';
            document.body.appendChild(plotDiv);

            let gridInfo;
            if (isDiff) {
                gridInfo = await this._generateDiffGrid(plotDiv, selection, baseFilteredNames, filters.sigOnly, phases, conditions, width, height, yAuto, yMin, yMax);
            } else {
                gridInfo = await this._generateSigGrid(plotDiv, selection, baseFilteredNames, filters.sigOnly, phases, conditions, width, height, yAuto, yMin, yMax);
            }

            // Export to image
            const format = showVenn ? 'png' : (this.traceFormat.value || 'png');
            const imgData = await Plotly.toImage(plotDiv, {
                format: format,
                width: width,
                height: height,
                scale: clampedScale,
            });

            document.body.removeChild(plotDiv);

            // Composite with Venn if enabled
            let finalImage;
            const canVenn = showVenn && gridInfo &&
                ((vennDim === 'row' && gridInfo.nRows > 1) ||
                 (vennDim === 'col' && gridInfo.nCols > 1));
            if (canVenn) {
                finalImage = await this._compositeTraceVenn(
                    imgData, gridInfo, width, height, clampedScale, vennDim
                );
            } else {
                finalImage = imgData;
            }

            // Show preview
            this.tracePreview.innerHTML = '';
            const img = document.createElement('img');
            img.src = finalImage;
            img.style.width = '100%';
            img.style.height = 'auto';
            this.tracePreview.appendChild(img);
            this._traceCanvas = finalImage;

        } catch (err) {
            console.error('Trace generation error:', err);
            this.tracePreview.innerHTML = `<div class="export-error">Error: ${err.message}</div>`;
        }

        this.btnTraceGenerate.disabled = false;
        this.btnTraceGenerate.textContent = 'Generate';
    }

    async _generateSigGrid(plotDiv, selection, baseFilteredNames, sigOnly, phases, conditions, width, height, yAuto, yMin, yMax) {
        const nRows = 2, nCols = 2;
        const traces = [];
        const annotations = [];
        // sigMap[row][col] = Set of sig electrode names
        const sigMap = Array.from({ length: nRows }, () => Array.from({ length: nCols }, () => new Set()));

        for (let row = 0; row < nRows; row++) {
            for (let col = 0; col < nCols; col++) {
                const phase = phases[col];
                const condition = conditions[row];
                const subplotIdx = row * nCols + col + 1;

                const hgaData = await this.app.dataManager.loadZscoreData(phase, condition);

                if (!hgaData) continue;

                // Re-select sig electrodes for this specific phase/condition
                const subplotNames = this._getSubplotElectrodeNames(hgaData, baseFilteredNames, sigOnly);
                // Record sig electrodes for Venn
                for (const name of subplotNames) sigMap[row][col].add(name);

                const traceData = this.app.dataManager.getTraceData(hgaData, subplotNames, 'data');
                if (!traceData) continue;

                const xAxis = `x${subplotIdx === 1 ? '' : subplotIdx}`;
                const yAxis = `y${subplotIdx === 1 ? '' : subplotIdx}`;

                // SEM fill
                const upper = traceData.mean.map((m, i) => m + traceData.sem[i]);
                const lower = traceData.mean.map((m, i) => m - traceData.sem[i]);

                traces.push({
                    x: [...traceData.times, ...traceData.times.slice().reverse()],
                    y: [...upper, ...lower.slice().reverse()],
                    type: 'scatter',
                    fill: 'toself',
                    fillcolor: 'rgba(79,195,247,0.15)',
                    line: { color: 'transparent' },
                    showlegend: false,
                    hoverinfo: 'skip',
                    xaxis: xAxis,
                    yaxis: yAxis,
                });

                // Mean line
                traces.push({
                    x: traceData.times,
                    y: traceData.mean,
                    type: 'scatter',
                    mode: 'lines',
                    name: `${phase} ${condition} (n=${traceData.n})`,
                    line: { color: '#4fc3f7', width: 1.5 },
                    showlegend: false,
                    xaxis: xAxis,
                    yaxis: yAxis,
                });

                // Title annotation
                annotations.push({
                    text: `<b>${phase} — ${condition}</b> (n=${traceData.n})`,
                    xref: `${xAxis} domain`,
                    yref: `${yAxis} domain`,
                    x: 0.5, y: 1,
                    xanchor: 'center', yanchor: 'bottom',
                    yshift: 4,
                    showarrow: false,
                    font: { size: 12, color: '#333' },
                });
            }
        }

        // Build subplot layout
        const layout = this._buildGridLayout(nRows, nCols, width, height, yAuto, yMin, yMax, annotations);
        layout.title = {
            text: 'HGA Trace — Z-score',
            font: { size: 16 },
        };

        Plotly.newPlot(plotDiv, traces, layout, { displayModeBar: false });
        return { nRows, nCols, phases, conditions, sigMap };
    }

    async _generateDiffGrid(plotDiv, selection, baseFilteredNames, sigOnly, phases, conditions, width, height, yAuto, yMin, yMax) {
        const diffConfig = this.app.dataManager.metadata.diff_types[selection.diffType];
        const direction = selection.direction;
        const needsCond = diffConfig.needs_condition;

        // If needsCond: 2×2 grid (rows=Decision,Repeat; cols=Stimulus,Response)
        // If !needsCond: 1×2 grid (cols=Stimulus,Response)
        const condList = needsCond ? conditions : [null];
        const nRows = condList.length;
        const nCols = phases.length;
        const traces = [];
        const annotations = [];
        const sigMap = Array.from({ length: nRows }, () => Array.from({ length: nCols }, () => new Set()));

        // Parse labels and get consistent colors
        const labels = this.app.hgaPlotter._parseDirectionLabels(direction, selection.diffType);
        const actColor = this.app.hgaPlotter._getConditionColor(labels.act);
        const bslColor = this.app.hgaPlotter._getConditionColor(labels.bsl);

        for (let row = 0; row < nRows; row++) {
            for (let col = 0; col < nCols; col++) {
                const phase = phases[col];
                const condition = condList[row];
                const subplotIdx = row * nCols + col + 1;

                let diffData;
                if (needsCond) {
                    diffData = await this.app.dataManager.loadDiffData(
                        selection.diffType, direction, phase, condition
                    );
                } else {
                    diffData = await this.app.dataManager.loadDiffData(
                        selection.diffType, direction, phase
                    );
                }

                if (!diffData) continue;

                // Re-select sig electrodes for this specific phase/condition
                const subplotNames = this._getSubplotElectrodeNames(diffData, baseFilteredNames, sigOnly);
                for (const name of subplotNames) sigMap[row][col].add(name);
                const actTrace = this.app.dataManager.getTraceData(diffData, subplotNames, 'data_act');
                const bslTrace = this.app.dataManager.getTraceData(diffData, subplotNames, 'data_bsl');

                const xAxis = `x${subplotIdx === 1 ? '' : subplotIdx}`;
                const yAxis = `y${subplotIdx === 1 ? '' : subplotIdx}`;

                // Act trace
                if (actTrace) {
                    this._addSEMTrace(traces, actTrace, labels.act, actColor, xAxis, yAxis);
                }

                // Bsl trace
                if (bslTrace) {
                    this._addSEMTrace(traces, bslTrace, labels.bsl, bslColor, xAxis, yAxis);
                }

                // Zero line
                if (actTrace) {
                    traces.push({
                        x: [actTrace.times[0], actTrace.times[actTrace.times.length - 1]],
                        y: [0, 0],
                        type: 'scatter', mode: 'lines',
                        line: { color: 'rgba(0,0,0,0.3)', width: 1, dash: 'dash' },
                        showlegend: false, hoverinfo: 'skip',
                        xaxis: xAxis, yaxis: yAxis,
                    });
                }

                // Title annotation
                const n = actTrace ? actTrace.n : (bslTrace ? bslTrace.n : 0);
                const titleText = condition
                    ? `<b>${phase} — ${condition}</b> (n=${n})`
                    : `<b>${phase}</b> (n=${n})`;

                annotations.push({
                    text: titleText,
                    xref: `${xAxis} domain`,
                    yref: `${yAxis} domain`,
                    x: 0.5, y: 1,
                    xanchor: 'center', yanchor: 'bottom',
                    yshift: 4,
                    showarrow: false,
                    font: { size: 12, color: '#333' },
                });
            }
        }

        // Add a single shared legend by marking first occurrence only
        let legendActAdded = false, legendBslAdded = false;
        for (const t of traces) {
            if (t.name === labels.act && !legendActAdded && t.mode === 'lines') {
                t.showlegend = true;
                legendActAdded = true;
            } else if (t.name === labels.bsl && !legendBslAdded && t.mode === 'lines') {
                t.showlegend = true;
                legendBslAdded = true;
            }
        }

        const layout = this._buildGridLayout(nRows, nCols, width, height, yAuto, yMin, yMax, annotations);
        layout.title = {
            text: `Diff Trace — ${selection.diffType} (${direction}: ${labels.act} vs ${labels.bsl})`,
            font: { size: 16 },
        };
        layout.showlegend = true;
        layout.legend = { font: { size: 12 }, x: 1, y: 1, xanchor: 'right' };

        Plotly.newPlot(plotDiv, traces, layout, { displayModeBar: false });
        return { nRows, nCols, phases, conditions: condList, sigMap };
    }

    /**
     * Add mean ± SEM trace pair for a subplot.
     */
    _addSEMTrace(traces, traceData, label, color, xAxis, yAxis) {
        const upper = traceData.mean.map((m, i) => m + traceData.sem[i]);
        const lower = traceData.mean.map((m, i) => m - traceData.sem[i]);

        // SEM fill
        traces.push({
            x: [...traceData.times, ...traceData.times.slice().reverse()],
            y: [...upper, ...lower.slice().reverse()],
            type: 'scatter',
            fill: 'toself',
            fillcolor: this._hexToRGBA(color, 0.15),
            line: { color: 'transparent' },
            showlegend: false,
            hoverinfo: 'skip',
            xaxis: xAxis,
            yaxis: yAxis,
        });

        // Mean line
        traces.push({
            x: traceData.times,
            y: traceData.mean,
            type: 'scatter',
            mode: 'lines',
            name: label,
            line: { color: color, width: 1.5 },
            showlegend: false,
            xaxis: xAxis,
            yaxis: yAxis,
        });
    }

    /**
     * Get electrode names for a specific subplot, re-selecting sig electrodes
     * for that particular phase/condition's data.
     */
    _getSubplotElectrodeNames(hgaData, baseFilteredNames, sigOnly) {
        if (!hgaData || !hgaData.channel_names) return baseFilteredNames;
        // Always limit to electrodes that have data
        const dataSet = new Set(hgaData.channel_names);
        let names = baseFilteredNames.filter(name => dataSet.has(name));
        if (sigOnly && hgaData.sig_channels) {
            const sigSet = new Set(hgaData.sig_channels);
            names = names.filter(name => sigSet.has(name));
        }
        return names;
    }

    /**
     * Build Plotly layout for a rows × cols subplot grid.
     * Margins and gaps are computed from pixel dimensions to avoid overlaps.
     */
    _buildGridLayout(nRows, nCols, width, height, yAuto, yMin, yMax, annotations) {
        // Compute margins in fractional units based on pixel needs
        const pxToFracW = (px) => px / width;
        const pxToFracH = (px) => px / height;

        // Fixed pixel budgets
        const titlePx = 40;        // top title
        const xLabelPx = 32;       // x-axis label + tick labels on bottom row
        const yLabelPx = 50;       // y-axis label + tick labels on left column
        const subTitlePx = 22;     // subplot title annotation above each plot
        const tickPx = 18;         // tick labels on non-labeled axes
        const padPx = 6;           // small padding

        const topMarginFrac = pxToFracH(titlePx + padPx);
        const bottomMarginFrac = pxToFracH(xLabelPx + padPx);
        const leftMarginFrac = pxToFracW(yLabelPx + padPx);
        const rightMarginFrac = pxToFracW(10);

        // Vertical gap: needs space for subplot title + x tick labels of row above
        const vGapPx = subTitlePx + tickPx + padPx * 2;
        const vGap = nRows > 1 ? pxToFracH(vGapPx) : 0;
        // Horizontal gap
        const hGapPx = tickPx + padPx * 2;
        const hGap = nCols > 1 ? pxToFracW(hGapPx) : 0;

        const plotW = (1 - leftMarginFrac - rightMarginFrac - (nCols - 1) * hGap) / nCols;
        const plotH = (1 - bottomMarginFrac - topMarginFrac - (nRows - 1) * vGap) / nRows;

        const layout = {
            width: width,
            height: height,
            margin: { l: yLabelPx + padPx, r: 10, t: titlePx, b: xLabelPx + padPx },
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#fafafa',
            font: { family: 'Arial, sans-serif', size: 11, color: '#333' },
            annotations: annotations,
            showlegend: false,
        };

        for (let row = 0; row < nRows; row++) {
            for (let col = 0; col < nCols; col++) {
                const idx = row * nCols + col + 1;
                const suffix = idx === 1 ? '' : idx.toString();

                const xDomain = [
                    leftMarginFrac + col * (plotW + hGap),
                    leftMarginFrac + col * (plotW + hGap) + plotW,
                ];
                const yDomain = [
                    bottomMarginFrac + (nRows - 1 - row) * (plotH + vGap),
                    bottomMarginFrac + (nRows - 1 - row) * (plotH + vGap) + plotH,
                ];

                const isBottomRow = row === nRows - 1;
                const isLeftCol = col === 0;

                layout[`xaxis${suffix}`] = {
                    domain: xDomain,
                    title: isBottomRow ? { text: 'Time (s)', font: { size: 11 } } : undefined,
                    showticklabels: isBottomRow,
                    gridcolor: 'rgba(0,0,0,0.08)',
                    zerolinecolor: 'rgba(0,0,0,0.2)',
                    zerolinewidth: 1,
                };
                layout[`yaxis${suffix}`] = {
                    domain: yDomain,
                    title: isLeftCol ? { text: 'HGA', font: { size: 11 } } : undefined,
                    showticklabels: isLeftCol,
                    gridcolor: 'rgba(0,0,0,0.08)',
                    zerolinecolor: 'rgba(0,0,0,0.2)',
                    zerolinewidth: 1,
                };

                if (!yAuto) {
                    layout[`yaxis${suffix}`].range = [yMin, yMax];
                }
            }
        }

        return layout;
    }

    /**
     * Composite Plotly trace image with Venn diagrams below.
     *
     * For vennDim='row': one Venn per column (phases), comparing rows (conditions).
     * For vennDim='col': one Venn per row (conditions), comparing columns (phases).
     */
    async _compositeTraceVenn(plotlyImgData, gridInfo, width, height, scale, vennDim) {
        const { nRows, nCols, phases, conditions, sigMap } = gridInfo;

        // Determine how many Venns and what sets each contains
        let vennCount, vennSetsArray;
        if (vennDim === 'row') {
            // One Venn per column, each comparing the rows
            vennCount = nCols;
            vennSetsArray = [];
            for (let col = 0; col < nCols; col++) {
                const sets = [];
                for (let row = 0; row < nRows; row++) {
                    const label = conditions[row] || `Row ${row}`;
                    sets.push({ label, items: sigMap[row][col] });
                }
                vennSetsArray.push({ title: phases[col], sets });
            }
        } else {
            // One Venn per row, each comparing the columns
            vennCount = nRows;
            vennSetsArray = [];
            for (let row = 0; row < nRows; row++) {
                const sets = [];
                for (let col = 0; col < nCols; col++) {
                    sets.push({ label: phases[col], items: sigMap[row][col] });
                }
                const label = conditions[row] || `Row ${row}`;
                vennSetsArray.push({ title: label, sets });
            }
        }

        // Compute Venn area dimensions (in scaled pixels)
        const scaledW = Math.round(width * scale);
        const scaledH = Math.round(height * scale);
        const vennRowHeight = Math.round(scaledH * 0.4);
        const vennCellWidth = Math.round(scaledW / vennCount);

        // Create the composite canvas
        const canvas = document.createElement('canvas');
        canvas.width = scaledW;
        canvas.height = scaledH + vennRowHeight;
        const ctx = canvas.getContext('2d');

        // Draw white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw the Plotly image on top
        const plotlyImg = await this._loadImage(plotlyImgData);
        ctx.drawImage(plotlyImg, 0, 0, scaledW, scaledH);

        // Draw a subtle divider line
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(20, scaledH + 2);
        ctx.lineTo(scaledW - 20, scaledH + 2);
        ctx.stroke();

        // Draw each Venn diagram
        for (let i = 0; i < vennCount; i++) {
            const { title, sets } = vennSetsArray[i];
            const vennDataURL = this._vennDiagram.render(
                sets, vennCellWidth, vennRowHeight, title, '#ffffff'
            );
            const vennImg = await this._loadImage(vennDataURL);
            ctx.drawImage(vennImg, i * vennCellWidth, scaledH);
        }

        return canvas.toDataURL('image/png');
    }

    /**
     * Load an image from a data URL and return a promise.
     */
    _loadImage(dataURL) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = dataURL;
        });
    }

    // =========================================================================
    // BRAIN PLOT EXPORT
    // =========================================================================

    async _generateBrainPlot() {
        this.btnBrainGenerate.disabled = true;
        this.btnBrainGenerate.textContent = 'Generating...';
        this.brainPreview.innerHTML = '<div class="export-loading">Rendering...</div>';

        const exportProjection = this.brainProjectToSurface?.checked || false;
        // Check if the settings panel already has projection active
        const settingsProjection = document.getElementById('setting-project-to-surface')?.checked || false;
        // Only apply/restore projection if export requests it and settings doesn't already have it on
        const needsProjection = exportProjection && !settingsProjection;

        try {
            const scale = parseFloat(this.brainScale?.value) || 1.0;
            const clampedScale = Math.max(0.5, Math.min(scale, 5));
            const width = Math.round((parseInt(this.brainWidth.value) || 1200) * clampedScale);
            const height = Math.round((parseInt(this.brainHeight.value) || 600) * clampedScale);
            const view = this.brainView.value;
            const bgColor = this.brainBgColor.value;

            // Apply surface projection if requested (and not already active)
            if (needsProjection) {
                this.app.renderer.projectElectrodesToSurface();
            }

            // Create composite depending on view mode
            let imgData;
            if (view === 'LR') {
                imgData = await this._renderDualView(width, height, bgColor, 'left', 'right');
            } else if (view === 'current') {
                imgData = await this._renderCurrentView(width, height, bgColor);
            } else {
                imgData = await this._renderSingleView(width, height, bgColor, view);
            }

            // Show preview
            this.brainPreview.innerHTML = '';
            const img = document.createElement('img');
            img.src = imgData;
            img.style.width = '100%';
            img.style.height = 'auto';
            this.brainPreview.appendChild(img);
            this._brainCanvas = imgData;

        } catch (err) {
            console.error('Brain plot generation error:', err);
            this.brainPreview.innerHTML = `<div class="export-error">Error: ${err.message}</div>`;
        } finally {
            // Restore original electrode positions if we applied projection for export
            if (needsProjection) {
                this.app.renderer.restoreElectrodePositions();
            }
        }

        this.btnBrainGenerate.disabled = false;
        this.btnBrainGenerate.textContent = 'Generate';
    }

    /**
     * Render the current view as-is.
     */
    async _renderCurrentView(width, height, bgColor) {
        const renderer = this.app.renderer;
        const prevBg = renderer.scene.background.clone();

        // Set background
        renderer.scene.background = new THREE.Color(bgColor);

        // Force a render at the export size
        const prevW = renderer.renderer.domElement.width;
        const prevH = renderer.renderer.domElement.height;
        renderer.renderer.setSize(width, height, false);
        renderer.camera.aspect = width / height;
        renderer.camera.updateProjectionMatrix();
        renderer.renderer.render(renderer.scene, renderer.camera);

        const dataURL = renderer.renderer.domElement.toDataURL('image/png');

        // Restore
        renderer.renderer.setSize(prevW, prevH, false);
        renderer.camera.aspect = prevW / prevH;
        renderer.camera.updateProjectionMatrix();
        renderer.scene.background = prevBg;
        renderer.renderer.render(renderer.scene, renderer.camera);

        return dataURL;
    }

    /**
     * Render a single preset view.
     */
    async _renderSingleView(width, height, bgColor, viewName) {
        const renderer = this.app.renderer;
        const prevBg = renderer.scene.background.clone();
        const prevPos = renderer.camera.position.clone();
        const prevUp = renderer.camera.up.clone();
        const prevTarget = renderer.controls.target.clone();

        // Set view and background
        renderer.scene.background = new THREE.Color(bgColor);
        renderer.setView(viewName);

        // Force render at export size
        const prevW = renderer.renderer.domElement.width;
        const prevH = renderer.renderer.domElement.height;
        renderer.renderer.setSize(width, height, false);
        renderer.camera.aspect = width / height;
        renderer.camera.updateProjectionMatrix();

        // need to update controls after setView
        renderer.controls.update();
        renderer.renderer.render(renderer.scene, renderer.camera);

        const dataURL = renderer.renderer.domElement.toDataURL('image/png');

        // Restore
        renderer.renderer.setSize(prevW, prevH, false);
        renderer.camera.aspect = prevW / prevH;
        renderer.camera.updateProjectionMatrix();
        renderer.camera.position.copy(prevPos);
        renderer.camera.up.copy(prevUp);
        renderer.controls.target.copy(prevTarget);
        renderer.controls.update();
        renderer.scene.background = prevBg;
        renderer.renderer.render(renderer.scene, renderer.camera);

        return dataURL;
    }

    /**
     * Render left + right hemispheres side by side.
     */
    async _renderDualView(totalWidth, totalHeight, bgColor, view1, view2) {
        const halfW = Math.floor(totalWidth / 2);

        const img1 = await this._renderSingleView(halfW, totalHeight, bgColor, view1);
        const img2 = await this._renderSingleView(halfW, totalHeight, bgColor, view2);

        // Composite on a canvas
        const canvas = document.createElement('canvas');
        canvas.width = totalWidth;
        canvas.height = totalHeight;
        const ctx = canvas.getContext('2d');

        // Fill background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        // Draw both images
        const imgEl1 = await this._loadImage(img1);
        const imgEl2 = await this._loadImage(img2);
        ctx.drawImage(imgEl1, 0, 0, halfW, totalHeight);
        ctx.drawImage(imgEl2, halfW, 0, halfW, totalHeight);

        return canvas.toDataURL('image/png');
    }

    _loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    // =========================================================================
    // Save / Copy helpers
    // =========================================================================

    _saveTrace() {
        if (!this._traceCanvas) {
            alert('Generate a trace plot first');
            return;
        }
        const fmt = this.traceFormat.value || 'png';
        this._downloadDataURL(this._traceCanvas, `hga_trace_export.${fmt}`);
    }

    _copyTrace() {
        if (!this._traceCanvas) {
            alert('Generate a trace plot first');
            return;
        }
        this._copyImageToClipboard(this._traceCanvas);
    }

    _saveBrain() {
        if (!this._brainCanvas) {
            alert('Generate a brain plot first');
            return;
        }
        const fmt = this.brainFormat.value || 'png';
        this._downloadDataURL(this._brainCanvas, `brain_export.${fmt}`);
    }

    _copyBrain() {
        if (!this._brainCanvas) {
            alert('Generate a brain plot first');
            return;
        }
        this._copyImageToClipboard(this._brainCanvas);
    }

    _saveVenn() {
        if (!this._vennCanvas) {
            alert('Generate a Venn diagram first');
            return;
        }
        this._downloadDataURL(this._vennCanvas, 'venn_diagram.png');
    }

    _copyVenn() {
        if (!this._vennCanvas) {
            alert('Generate a Venn diagram first');
            return;
        }
        this._copyImageToClipboard(this._vennCanvas);
    }

    _downloadDataURL(dataURL, filename) {
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    async _copyImageToClipboard(dataURL) {
        try {
            const response = await fetch(dataURL);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob }),
            ]);
            this.app.ui.setStatus('Image copied to clipboard');
        } catch (err) {
            console.error('Clipboard copy failed:', err);
            alert('Copy to clipboard failed. Try saving instead.\n' + err.message);
        }
    }

    // =========================================================================
    // VENN DIAGRAM
    // =========================================================================

    /**
     * Called when Data Source (zscore/diff) changes.
     */
    _onVennDataSourceChange() {
        const isDiff = this.vennDataSource.value === 'diff';
        this.vennDiffTypeGroup.style.display = isDiff ? '' : 'none';
        this.vennDimDirectionLabel.style.display = isDiff ? '' : 'none';

        // If switching to zscore, uncheck direction dimension
        if (!isDiff && this.vennDimDirection.checked) {
            this.vennDimDirection.checked = false;
        }

        // For zscore, condition dimension is always available
        // For diff with needs_condition=false (e.g. condition type), hide condition dim
        this._updateVennConditionDimVisibility();
        this._onVennDimChange();
    }

    /**
     * Called when Diff Type changes.
     */
    _onVennDiffTypeChange() {
        this._updateVennConditionDimVisibility();
        this._onVennDimChange();
    }

    /**
     * Show/hide condition dimension based on diff type config.
     */
    _updateVennConditionDimVisibility() {
        const isDiff = this.vennDataSource.value === 'diff';
        if (!isDiff) {
            // zscore: always show condition
            this.vennDimCondition.parentElement.style.display = '';
            return;
        }
        const diffType = this.vennDiffType.value;
        const metadata = this.app.dataManager.metadata;
        const config = metadata && metadata.diff_types[diffType];
        if (config && !config.needs_condition) {
            // condition diff: no condition dimension
            this.vennDimCondition.parentElement.style.display = 'none';
            if (this.vennDimCondition.checked) {
                this.vennDimCondition.checked = false;
            }
        } else {
            this.vennDimCondition.parentElement.style.display = '';
        }
    }

    /**
     * Called when any Venn dimension checkbox changes.
     * Enforces max 2 selections and rebuilds filter/circles panels.
     */
    _onVennDimChange() {
        const dims = this._getVennDimCheckboxes();
        const checked = dims.filter(d => d.checked);

        // Enforce max 2: disable unchecked ones if 2 already checked
        if (checked.length >= 2) {
            dims.forEach(d => {
                if (!d.checked) d.parentElement.classList.add('disabled');
            });
        } else {
            dims.forEach(d => d.parentElement.classList.remove('disabled'));
        }

        this._rebuildVennPanels();
    }

    /**
     * Get all active Venn dimension checkboxes.
     */
    _getVennDimCheckboxes() {
        const all = [this.vennDimPhase, this.vennDimCondition, this.vennDimDirection];
        // Only return visible ones
        return all.filter(cb => cb.parentElement.style.display !== 'none');
    }

    /**
     * Rebuild filter (data scope) and circles panels based on current dimension selection.
     */
    _rebuildVennPanels() {
        const isDiff = this.vennDataSource.value === 'diff';
        const diffType = this.vennDiffType.value;
        const metadata = this.app.dataManager.metadata;

        const vennDims = new Set();
        if (this.vennDimPhase.checked) vennDims.add('phase');
        if (this.vennDimCondition.checked) vennDims.add('condition');
        if (this.vennDimDirection.checked) vennDims.add('direction');

        const phases = metadata ? metadata.phases : ['Cue', 'Stimulus', 'Delay', 'Response'];
        const conditions = metadata ? metadata.conditions : ['Decision', 'Passive', 'Repeat'];
        const config = metadata && isDiff ? metadata.diff_types[diffType] : null;
        const directions = config ? config.directions : [];

        // Determine which dimensions are available but NOT Venn dimensions → filter
        // Phase is always a dimension
        const showPhaseFilter = !vennDims.has('phase');
        const showConditionFilter = !vennDims.has('condition') &&
            (!isDiff || (config && config.needs_condition));
        const showDirectionFilter = !vennDims.has('direction') && isDiff;

        // Filter panels (non-Venn dims: select which data to include)
        this.vennFilterPhaseGroup.style.display = showPhaseFilter ? '' : 'none';
        this.vennFilterConditionGroup.style.display = showConditionFilter ? '' : 'none';
        this.vennFilterDirectionGroup.style.display = showDirectionFilter ? '' : 'none';

        if (showPhaseFilter) {
            this._buildVennCheckboxList(this.vennFilterPhaseList, phases, 'vf-phase', true);
        }
        if (showConditionFilter) {
            this._buildVennCheckboxList(this.vennFilterConditionList, conditions, 'vf-cond', true);
        }
        if (showDirectionFilter) {
            this._buildVennCheckboxList(this.vennFilterDirectionList, directions, 'vf-dir', true);
        }

        // Circles panels (Venn dims: select which circles to draw)
        this.vennCirclesPhaseGroup.style.display = vennDims.has('phase') ? '' : 'none';
        this.vennCirclesConditionGroup.style.display = vennDims.has('condition') ? '' : 'none';
        this.vennCirclesDirectionGroup.style.display = vennDims.has('direction') ? '' : 'none';

        if (vennDims.has('phase')) {
            this._buildVennCheckboxList(this.vennCirclesPhaseList, phases, 'vc-phase', true);
        }
        if (vennDims.has('condition')) {
            this._buildVennCheckboxList(this.vennCirclesConditionList, conditions, 'vc-cond', true);
        }
        if (vennDims.has('direction')) {
            this._buildVennCheckboxList(this.vennCirclesDirectionList, directions, 'vc-dir', true);
        }
    }

    /**
     * Build a simple checkbox list in a container.
     */
    _buildVennCheckboxList(container, values, groupName, allChecked) {
        container.innerHTML = '';
        for (const val of values) {
            const div = document.createElement('div');
            div.className = 'ms-item';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = val;
            cb.checked = allChecked;
            cb.id = `ms-${groupName}-${val}`;
            const lbl = document.createElement('label');
            lbl.htmlFor = cb.id;
            lbl.textContent = val;
            div.appendChild(cb);
            div.appendChild(lbl);
            container.appendChild(div);
        }
    }

    /**
     * Get checked values from a container's checkboxes.
     */
    _getCheckedValuesFrom(container) {
        const result = [];
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (cb.checked) result.push(cb.value);
        });
        return result;
    }

    /**
     * Generate the Venn diagram.
     * 1. Determine which dimension(s) are Venn dimensions.
     * 2. For each Venn circle, collect sig electrodes across all non-Venn dimension combos (union, deduplicated).
     * 3. Render with VennDiagram.
     */
    async _generateVenn() {
        this.btnVennGenerate.disabled = true;
        this.btnVennGenerate.textContent = 'Generating...';
        this.vennPreview.innerHTML = '<div class="export-loading">Loading data & computing...</div>';

        try {
            const isDiff = this.vennDataSource.value === 'diff';
            const diffType = this.vennDiffType.value;
            const metadata = this.app.dataManager.metadata;
            const config = isDiff ? metadata.diff_types[diffType] : null;
            const needsCond = config ? config.needs_condition : false;

            // Identify venn dims and their selected values
            const vennDims = [];
            if (this.vennDimPhase.checked) {
                vennDims.push({
                    name: 'phase',
                    values: this._getCheckedValuesFrom(this.vennCirclesPhaseList),
                });
            }
            if (this.vennDimCondition.checked) {
                vennDims.push({
                    name: 'condition',
                    values: this._getCheckedValuesFrom(this.vennCirclesConditionList),
                });
            }
            if (this.vennDimDirection.checked) {
                vennDims.push({
                    name: 'direction',
                    values: this._getCheckedValuesFrom(this.vennCirclesDirectionList),
                });
            }

            if (vennDims.length === 0) {
                this.vennPreview.innerHTML = '<div class="export-error">Please select at least one Venn dimension.</div>';
                this.btnVennGenerate.disabled = false;
                this.btnVennGenerate.textContent = 'Generate';
                return;
            }

            // Get filter values for non-Venn dims
            const filterPhases = this.vennFilterPhaseGroup.style.display !== 'none'
                ? this._getCheckedValuesFrom(this.vennFilterPhaseList) : null;
            const filterConditions = this.vennFilterConditionGroup.style.display !== 'none'
                ? this._getCheckedValuesFrom(this.vennFilterConditionList) : null;
            const filterDirections = this.vennFilterDirectionGroup.style.display !== 'none'
                ? this._getCheckedValuesFrom(this.vennFilterDirectionList) : null;

            // Build the set of "circles" to draw
            // Each circle is defined by a combination of Venn dimension values
            // If 1 venn dim: each value → one circle
            // If 2 venn dims: cross product → one circle per combo
            let circleSpecs;
            if (vennDims.length === 1) {
                circleSpecs = vennDims[0].values.map(v => ({
                    label: v,
                    [vennDims[0].name]: v,
                }));
            } else {
                // Cross product of two dims
                circleSpecs = [];
                for (const v0 of vennDims[0].values) {
                    for (const v1 of vennDims[1].values) {
                        circleSpecs.push({
                            label: `${v0} × ${v1}`,
                            [vennDims[0].name]: v0,
                            [vennDims[1].name]: v1,
                        });
                    }
                }
            }

            if (circleSpecs.length === 0) {
                this.vennPreview.innerHTML = '<div class="export-error">No circles selected.</div>';
                this.btnVennGenerate.disabled = false;
                this.btnVennGenerate.textContent = 'Generate';
                return;
            }

            // For each circle spec, collect sig electrodes by iterating over non-Venn dim combos
            const sets = [];
            for (const spec of circleSpecs) {
                const sigSet = await this._collectSigForCircle(
                    spec, isDiff, diffType, config, needsCond,
                    vennDims, filterPhases, filterConditions, filterDirections
                );
                sets.push({
                    label: spec.label,
                    items: sigSet,
                });
            }

            // Build title
            let title = isDiff ? `Sig Electrode Overlap (${diffType} diff)` : 'Sig Electrode Overlap (z-score)';
            const filterParts = [];
            if (filterPhases && filterPhases.length < 3) filterParts.push(`Phase: ${filterPhases.join(', ')}`);
            if (filterConditions && filterConditions.length < 3) filterParts.push(`Cond: ${filterConditions.join(', ')}`);
            if (filterDirections) filterParts.push(`Dir: ${filterDirections.join(', ')}`);
            if (filterParts.length > 0) title += ` | ${filterParts.join(' | ')}`;

            // Render
            const baseW = parseInt(this.vennWidth.value) || 800;
            const baseH = parseInt(this.vennHeight.value) || 600;
            const scale = Math.max(0.5, Math.min(parseFloat(this.vennScale?.value) || 2, 5));
            const width = Math.round(baseW * scale);
            const height = Math.round(baseH * scale);
            const bgColor = this.vennBgColor.value;

            const dataURL = this._vennDiagram.render(sets, width, height, title, bgColor);

            // Show preview
            this.vennPreview.innerHTML = '';
            const img = document.createElement('img');
            img.src = dataURL;
            img.style.width = '100%';
            img.style.height = 'auto';
            this.vennPreview.appendChild(img);
            this._vennCanvas = dataURL;

        } catch (err) {
            console.error('Venn diagram generation error:', err);
            this.vennPreview.innerHTML = `<div class="export-error">Error: ${err.message}</div>`;
        }

        this.btnVennGenerate.disabled = false;
        this.btnVennGenerate.textContent = 'Generate';
    }

    /**
     * Collect sig electrode names for one Venn circle.
     *
     * The circle has fixed values for its Venn dimensions (from spec).
     * For non-Venn dimensions, we iterate over all selected filter values
     * and take the UNION of sig electrodes (deduplicated).
     *
     * @param {object} spec - {label, phase?, condition?, direction?}
     * @param {boolean} isDiff
     * @param {string} diffType
     * @param {object} config - diff type config
     * @param {boolean} needsCond
     * @param {Array} vennDims - [{name, values}]
     * @param {Array|null} filterPhases
     * @param {Array|null} filterConditions
     * @param {Array|null} filterDirections
     * @returns {Promise<Set<string>>}
     */
    async _collectSigForCircle(spec, isDiff, diffType, config, needsCond,
                                vennDims, filterPhases, filterConditions, filterDirections) {
        const metadata = this.app.dataManager.metadata;
        const vennDimNames = new Set(vennDims.map(d => d.name));

        // Determine which values to iterate for each dimension
        const phases = vennDimNames.has('phase')
            ? [spec.phase]
            : (filterPhases || metadata.phases);
        const conditions = vennDimNames.has('condition')
            ? [spec.condition]
            : (filterConditions || metadata.conditions);
        const directions = vennDimNames.has('direction')
            ? [spec.direction]
            : (filterDirections || (config ? config.directions : []));

        const sigSet = new Set();

        if (isDiff) {
            for (const phase of phases) {
                for (const dir of directions) {
                    if (needsCond) {
                        for (const cond of conditions) {
                            const data = await this.app.dataManager.loadDiffData(diffType, dir, phase, cond);
                            if (data && data.sig_channels) {
                                for (const ch of data.sig_channels) sigSet.add(ch);
                            }
                        }
                    } else {
                        const data = await this.app.dataManager.loadDiffData(diffType, dir, phase);
                        if (data && data.sig_channels) {
                            for (const ch of data.sig_channels) sigSet.add(ch);
                        }
                    }
                }
            }
        } else {
            // zscore
            for (const phase of phases) {
                for (const cond of conditions) {
                    const data = await this.app.dataManager.loadZscoreData(phase, cond);
                    if (data && data.sig_channels) {
                        for (const ch of data.sig_channels) sigSet.add(ch);
                    }
                }
            }
        }

        return sigSet;
    }

    // =========================================================================
    // Utility
    // =========================================================================

    _hexToRGBA(hex, alpha) {
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }
}
