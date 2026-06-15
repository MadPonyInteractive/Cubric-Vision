'use strict';

// Central backend scrubber for RunPod secrets before anything reaches app.log,
// console mirrors, or bug-report payloads.

function redactSecrets(value) {
    if (value == null) return value;

    const text = String(value);
    return text
        .replace(/api_key=[^&\s"']+/gi, 'api_key=[REDACTED]')
        .replace(/([?&]token=)[^&\s"']+/gi, '$1[REDACTED]')
        .replace(/(token["'\s:=]+)([A-Za-z0-9._-]{16,})/gi, '$1[REDACTED]')
        .replace(/rpa_[A-Za-z0-9_-]{8,}/g, 'rpa_[REDACTED]')
        .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [REDACTED]');
}

module.exports = {
    redactSecrets,
};
