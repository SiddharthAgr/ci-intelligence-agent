/**
 * src/memory/sessionManager.js
 * =============================
 * Standalone Session Manager & Context Loader
 * 
 * Replaces session-start-context.mjs and session-stop-logger.mjs
 * Provides session lifecycle context loading and audit logging without IBM Bob dependencies.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { getDb, queryAll, run } = require('../../mcp/db');

const JSONL_PATH = path.resolve(__dirname, '..', '..', 'memory', 'sessions.jsonl');

/**
 * Loads recent historical failures to seed initial context for agent sessions.
 * @param {number} [limit=5] 
 * @returns {Promise<object[]>}
 */
async function loadRecentFailureContext(limit = 5) {
  try {
    await getDb();
    const sql = `
      SELECT signature, test_name, error_type, action, confidence, stored_at
      FROM failures
      ORDER BY stored_at DESC
      LIMIT ?
    `;
    const rows = queryAll(sql, [limit]);
    return rows;
  } catch (err) {
    return [];
  }
}

/**
 * Logs session completion metadata to JSONL file and SQLite database.
 * @param {object} params
 * @param {string} [params.sessionId]
 * @param {string} [params.summary]
 * @param {string} [params.outcome]
 * @param {number} [params.failuresProcessed]
 * @param {string} [params.startedAt]
 * @returns {Promise<object>} Log entry created
 */
async function logSessionEnd({
  sessionId = `session-${Date.now()}`,
  summary = 'Session completed',
  outcome,
  failuresProcessed = 0,
  startedAt = null,
} = {}) {
  const stoppedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  function inferOutcome(s) {
    if (!s) return 'no_action';
    if (/escalat/i.test(s)) return 'escalated';
    if (/store|stored|recommend/i.test(s)) return 'recommendation_stored';
    return 'no_action';
  }

  const finalOutcome = outcome ?? inferOutcome(summary);

  const entry = {
    session_id:         sessionId,
    outcome:            finalOutcome,
    summary,
    started_at:         startedAt,
    stopped_at:         stoppedAt,
    failures_processed: failuresProcessed,
  };

  // 1. Write to JSONL
  try {
    const dir = path.dirname(JSONL_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(JSONL_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    // Ignore log file write failure
  }

  // 2. Write to SQLite
  try {
    await getDb();
    run(`
      INSERT OR REPLACE INTO sessions
        (session_id, failures_processed, outcome, summary, started_at, stopped_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      entry.session_id,
      entry.failures_processed,
      entry.outcome,
      entry.summary,
      entry.started_at,
      entry.stopped_at,
    ]);
  } catch (err) {
    // Ignore DB log failure
  }

  return entry;
}

module.exports = {
  loadRecentFailureContext,
  logSessionEnd,
};
