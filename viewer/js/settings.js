/**
 * Settings — Handles the settings modal and applies changes to the renderer.
 */
class SettingsManager {
    constructor(app) {
        this.app = app;

        // Modal
        this.modal = document.getElementById('settings-modal');
        this.btnOpen = document.getElementById('btn-settings');
        this.btnClose = document.getElementById('btn-close-settings');

        // Setting inputs
        this.brainOpacity = document.getElementById('setting-brain-opacity');
        this.brainColor = document.getElementById('setting-brain-color');
        this.showROISurface = document.getElementById('setting-show-roi-surface');
        this.electrodeRadius = document.getElementById('setting-electrode-radius');
        this.electrodeOpacity = document.getElementById('setting-electrode-opacity');
        this.highlightRadius = document.getElementById('setting-highlight-radius');
        this.projectToSurface = document.getElementById('setting-project-to-surface');
        this.bgColor = document.getElementById('setting-bg-color');
        this.ambientLight = document.getElementById('setting-ambient-light');

        // Value displays
        this.valBrainOpacity = document.getElementById('val-brain-opacity');
        this.valElectrodeRadius = document.getElementById('val-electrode-radius');
        this.valElectrodeOpacity = document.getElementById('val-electrode-opacity');
        this.valHighlightRadius = document.getElementById('val-highlight-radius');
        this.valAmbientLight = document.getElementById('val-ambient-light');

        this._bindEvents();
    }

    _bindEvents() {
        // Open/close modal
        this.btnOpen.addEventListener('click', () => {
            this.modal.style.display = 'flex';
        });
        this.btnClose.addEventListener('click', () => {
            this.modal.style.display = 'none';
        });
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.modal.style.display = 'none';
        });

        // Brain opacity
        this.brainOpacity.addEventListener('input', () => {
            const val = this.brainOpacity.value / 100;
            this.valBrainOpacity.textContent = val.toFixed(2);
            this.app.renderer.updateBrainOpacity(val);
        });

        // Brain color
        this.brainColor.addEventListener('input', () => {
            this.app.renderer.updateBrainColor(
                new THREE.Color(this.brainColor.value)
            );
        });

        // Show ROI surface
        this.showROISurface.addEventListener('change', () => {
            this.app.renderer.settings.showROISurface = this.showROISurface.checked;
            // Rebuild brain mesh with/without ROI colors
            this.app.rebuildBrainMesh();
        });

        // Electrode radius
        this.electrodeRadius.addEventListener('input', () => {
            const val = parseFloat(this.electrodeRadius.value);
            this.valElectrodeRadius.textContent = val.toFixed(1);
            this.app.renderer.updateElectrodeRadius(val);
        });

        // Electrode opacity
        this.electrodeOpacity.addEventListener('input', () => {
            const val = this.electrodeOpacity.value / 100;
            this.valElectrodeOpacity.textContent = val.toFixed(2);
            this.app.renderer.updateElectrodeOpacity(val);
        });

        // Highlight radius
        this.highlightRadius.addEventListener('input', () => {
            const val = parseFloat(this.highlightRadius.value);
            this.valHighlightRadius.textContent = val.toFixed(1);
            this.app.renderer.settings.highlightRadius = val;
        });

        // Project to surface
        this.projectToSurface.addEventListener('change', () => {
            if (this.projectToSurface.checked) {
                this.app.renderer.projectElectrodesToSurface();
            } else {
                this.app.renderer.restoreElectrodePositions();
            }
        });

        // Background color
        this.bgColor.addEventListener('input', () => {
            this.app.renderer.updateBackground(
                new THREE.Color(this.bgColor.value)
            );
        });

        // Ambient light
        this.ambientLight.addEventListener('input', () => {
            const val = this.ambientLight.value / 100;
            this.valAmbientLight.textContent = val.toFixed(2);
            this.app.renderer.updateAmbientLight(val);
        });
    }

    /**
     * Push all current HTML input values into the renderer settings
     * and apply them to already-built meshes / scene.
     * Call this once after the renderer is ready so that HTML defaults
     * override the hard-coded values in brain-renderer.js.
     */
    applyAll() {
        const r = this.app.renderer;
        r.updateBrainOpacity(this.brainOpacity.value / 100);
        r.updateBrainColor(new THREE.Color(this.brainColor.value));
        r.settings.showROISurface = this.showROISurface.checked;
        r.updateElectrodeRadius(parseFloat(this.electrodeRadius.value));
        r.updateElectrodeOpacity(this.electrodeOpacity.value / 100);
        r.settings.highlightRadius = parseFloat(this.highlightRadius.value);
        r.updateBackground(new THREE.Color(this.bgColor.value));
        r.updateAmbientLight(this.ambientLight.value / 100);
    }
}
