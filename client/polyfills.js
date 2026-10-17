// Browser polyfills for terra.js / feather.js — they expect Node's Buffer
// to exist as a global. Must be imported before anything else in main.jsx.
import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  if (!window.global) window.global = window;
}
globalThis.Buffer = Buffer;
