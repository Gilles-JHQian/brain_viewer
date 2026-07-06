export function buildAnimationCacheKey(
  phase, condition, selectedLoad, subjectsKey, electrodeSetKey,
  windowSec = '', gateByWindow = true, boundsKey = '',
) {
  return `${phase}|c${condition}|${selectedLoad}|${subjectsKey}|${electrodeSetKey}`
    + `|w${windowSec}|g${gateByWindow ? 1 : 0}|b${boundsKey}`;
}
