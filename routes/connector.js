'use strict';

/**
 * routes/connector.js — Vision's caller-side connector HTTP surface (MPI-5).
 *
 * The broker client lives in this (forked server.js) process. The renderer
 * reaches it over the existing localhost:3000 surface:
 *   GET  /connector/capabilities  -> { promptEnhance: boolean }  (UI gating)
 *   POST /connector/enhance       -> the prompt.enhance response envelope
 *
 * The client is injected by server.js after the responder connects (mirrors
 * comfy's setAxios pattern). No broker / no Prompt => promptEnhance:false and
 * /connector/enhance returns a clean unavailable response — never a 500.
 */

const express = require('express');
const router = express.Router();

const { isPromptEnhanceAvailable, requestEnhance } = require('../services/connectorResponder');

let _client = null;
function setClient(client) { _client = client; }

router.get('/connector/capabilities', async (_req, res) => {
  const promptEnhance = await isPromptEnhanceAvailable(_client);
  res.json({ promptEnhance });
});

router.post('/connector/enhance', async (req, res) => {
  if (!_client) {
    return res.json({
      ok: false,
      error: { code: 'APP_UNAVAILABLE', message: 'Connector broker not connected.' },
    });
  }
  try {
    const { prompt, negativePrompt, targetModelId, operation, injectionParams } = req.body || {};
    const resp = await requestEnhance(_client, {
      prompt: prompt || '',
      negativePrompt: negativePrompt || '',
      targetModelId,
      operation,
      injectionParams,
    });
    res.json(resp);
  } catch (err) {
    res.json({
      ok: false,
      error: { code: 'RUNTIME_ERROR', message: err && err.message ? err.message : 'Enhance failed.' },
    });
  }
});

module.exports = router;
module.exports.setClient = setClient;
