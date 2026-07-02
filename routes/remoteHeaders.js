/**
 * remoteHeaders.js — shared RunPod HTTP header helpers.
 *
 * MPI-173: the browser UA was copy-pasted byte-identical into remoteProxy.js,
 * remoteModels.js, remoteEngine.js and runpodRemote.js. Cloudflare fronts the
 * RunPod proxy AND the API; the default fetch UA gets HTTP 403 error 1010
 * (verified MPI-64), so every RunPod call must send a browser UA. Single
 * source now.
 *
 * Each route keeps its own _authHeaders() because the podId source differs
 * (remoteProxy reads its local _mode.podId; remoteModels goes via
 * getRemoteMode()); they share only the header shape below.
 */
'use strict';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120 Safari/537.36';

// Bearer + browser UA for an authenticated wrapper call.
function buildAuthHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'User-Agent': UA };
}

module.exports = { UA, buildAuthHeaders };
