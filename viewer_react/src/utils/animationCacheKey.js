export function buildAnimationCacheKey(
  phase, selectedLoad, subjectsKey, electrodeSetKey, windowSec = '', gateByWindow = true,
) {
  return `${phase}|${selectedLoad}|${subjectsKey}|${electrodeSetKey}|w${windowSec}|g${gateByWindow ? 1 : 0}`;
}
