export function buildAnimationCacheKey(phase, selectedLoad, subjectsKey, electrodeSetKey, windowSec = '') {
  return `${phase}|${selectedLoad}|${subjectsKey}|${electrodeSetKey}|w${windowSec}`;
}
