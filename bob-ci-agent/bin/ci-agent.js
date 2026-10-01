#!/usr/bin/env node
/**
 * bin/ci-agent.js
 * ===============
 * Executable CLI entrypoint for ci-agent
 */

'use strict';

const { main } = require('../src/cli/index.js');

main(process.argv.slice(2)).catch((err) => {
  console.error('Fatal CLI Error:', err.message);
  process.exit(1);
});
