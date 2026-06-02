export const TOUR_STORAGE_KEY = 'phase_overlap_tour_v2_completed';

export function isTourCompleted() {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(TOUR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTourCompleted() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, '1');
  } catch {
    // ignore quota / private mode
  }
}

export function clearTourCompleted() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function tourSelector(id) {
  return `[data-tour="${id}"]`;
}

const REQUIRED_TOUR_ANCHORS = [
  'tour-welcome',
  'load-selector',
  'venn-selector',
  'brain-controls',
  'waveform-panel',
];

export function areTourAnchorsReady() {
  if (typeof document === 'undefined') return false;
  return REQUIRED_TOUR_ANCHORS.every((id) => Boolean(document.querySelector(tourSelector(id))));
}

export function buildTourSteps() {
  return [
    {
      element: tourSelector('tour-welcome'),
      popover: {
        title: 'Welcome to the HGA Phase Overlap Viewer',
        description: 'This short tour highlights the main controls for exploring phase overlap, brain maps, and time courses. Use Next to continue, or Exit tour to skip.',
        side: 'over',
        align: 'center',
        popoverClass: 'phase-overlap-tour-popover phase-overlap-tour-welcome',
      },
    },
    {
      element: tourSelector('load-selector'),
      popover: {
        title: 'Working-memory load',
        description: 'Switch among loads 3, 5, 7, 9, or All to change which Sternberg load drives the HGA averages and animations.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: tourSelector('venn-selector'),
      popover: {
        title: 'Phase overlap',
        description: 'Choose 2–4 phases, then click Venn regions to filter electrodes by overlap pattern (union of selected components).',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: tourSelector('subject-filter'),
      popover: {
        title: 'Subject filter',
        description: 'Include or exclude individual subjects. Counts, the brain map, and waveforms all update to match your subject selection.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: tourSelector('brain-controls'),
      popover: {
        title: 'Brain view',
        description: 'Choose Left, Right, or Both hemispheres. Switch to Electrodes to see contact locations, or KDE projection for a density map. Click an electrode for single-contact details.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: tourSelector('roi-filter'),
      popover: {
        title: 'ROI filter',
        description: 'Click a bar to show or hide that anatomical region on the brain. Use Deselect all / Show all for quick resets.',
        side: 'left',
        align: 'start',
      },
    },
    {
      element: tourSelector('waveform-panel'),
      popover: {
        title: 'Time courses',
        description: 'Press Play on any phase to animate sliding-window HGA. The brain map and playback cursor update in sync. KDE mode pre-renders frames before playback starts.',
        side: 'top',
        align: 'center',
      },
    },
  ];
}

export function resolveTourSteps() {
  return buildTourSteps().filter((step) => {
    if (!step.element) return true;
    const selector = typeof step.element === 'string' ? step.element : null;
    if (!selector) return true;
    return Boolean(document.querySelector(selector));
  });
}
