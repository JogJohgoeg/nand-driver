// English wording on top of ../verify.js. The trust chain itself is not copied: every check runs in that one module.
import { lockState } from '../verify.js';
export { loadLock, checkedURL, checkedJSON, chipManifest, circuitInfo, ethCall, sha256, stats, CFG, CheckError, lockState, LOCAL } from '../verify.js';
export const chainNote = () => { const s = lockState().chain;
  return s === 'ok' ? '' : s === 'pending' ? 'Local preview: this batch is not on chain yet, so this check used the pending release list.'
    : 'Not checked against the chain this time (nodes unreachable, or the check module did not load). Only the record list was checked. Reload to try again.'; };
export const okWord = () => { const s = lockState().chain; return s === 'ok' ? 'checked' : s === 'pending' ? 'checked (local)' : 'list only'; };
