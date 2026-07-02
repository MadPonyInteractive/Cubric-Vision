/**
 * remoteProxy.js — barrel for the RunPod remote-engine routes.
 *
 * MPI-175: the old 1,610-line monolith was split by responsibility into:
 *   - remotePodState.js      — remote-mode state + shared auth/health helpers
 *   - remotePodLifecycle.js  — Pod create/reconnect/stop/delete/teardown + specs/stats
 *   - remoteProxyForward.js  — /proxy/* wrapper forwarding + uploads + SSE relay
 *
 * This barrel mounts both route modules on one router (so server.js's single
 * `app.use(remoteProxyRoutes)` is unchanged) and re-exports getRemoteMode/
 * setRemoteMode for the external consumers (remoteModels.js). The SSE relay in
 * remoteProxyForward.js still falls through via next() to routes/comfy.js when
 * remote mode is inactive, so this must stay mounted before comfyRoutes.
 */
'use strict';

const express = require('express');
const router = express.Router();
const { getRemoteMode, setRemoteMode } = require('./remotePodState');
const { router: lifecycleRouter } = require('./remotePodLifecycle');
const { router: forwardRouter } = require('./remoteProxyForward');

router.use(lifecycleRouter);
router.use(forwardRouter);

module.exports = {
  router,
  getRemoteMode,
  setRemoteMode,
};
