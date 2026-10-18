// Shared WebGL renderer creation for every 3D stage in the club.
// Some phones and in-app WebViews refuse the fanciest context settings
// (antialias + a discrete-GPU preference is the usual refusal point) —
// degrade through plainer settings instead of dying to a black stage.
export function createRenderer(THREE, { alpha = false } = {}) {
  const base = alpha ? { alpha: true } : {};
  const attempts = [
    { ...base, antialias: true, powerPreference: 'high-performance' },
    { ...base, antialias: false, powerPreference: 'default' },
    { ...base, antialias: false, powerPreference: 'low-power' },
  ];
  let lastErr = null;
  for (const opts of attempts) {
    try {
      return new THREE.WebGLRenderer(opts);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('WebGL unavailable on this device');
}
