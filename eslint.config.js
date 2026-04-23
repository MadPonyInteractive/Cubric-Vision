const js = require('@eslint/js');
const noRawDomQuery = require('./.eslint-rules/no-raw-dom-query');
const noRawEventListener = require('./.eslint-rules/no-raw-event-listener');
const noWindowHotkey = require('./.eslint-rules/no-window-hotkey');
const noNestedStateMutation = require('./.eslint-rules/no-nested-state-mutation');
const noRawConsole = require('./.eslint-rules/no-raw-console');
const requireDestroyOnEvents = require('./.eslint-rules/require-destroy-on-events');
const noSameTierComponentImport = require('./.eslint-rules/no-same-tier-component-import');
const noHardcodedHexColor = require('./.eslint-rules/no-hardcoded-hex-color');

const mpiPlugin = {
  rules: {
    'no-raw-dom-query': noRawDomQuery,
    'no-raw-event-listener': noRawEventListener,
    'no-window-hotkey': noWindowHotkey,
    'no-nested-state-mutation': noNestedStateMutation,
    'no-raw-console': noRawConsole,
    'require-destroy-on-events': requireDestroyOnEvents,
    'no-same-tier-component-import': noSameTierComponentImport,
    'no-hardcoded-hex-color': noHardcodedHexColor,
  },
};

module.exports = [
  {
    ignores: [
      'js/components/factory.js',
      'js/vendor/**',
      'node_modules/**',
      'logs/**',
    ],
  },
  {
    files: ['js/**/*.js'],
    plugins: {
      mpi: mpiPlugin,
    },
    rules: {
      'mpi/no-raw-dom-query': 'warn',
      'mpi/no-raw-event-listener': 'warn',
      'mpi/no-window-hotkey': 'warn',
      'mpi/no-nested-state-mutation': 'warn',
      'mpi/no-raw-console': 'warn',
      'mpi/require-destroy-on-events': 'warn',
      'mpi/no-same-tier-component-import': 'warn',
      'mpi/no-hardcoded-hex-color': 'warn',
    },
  },
];
