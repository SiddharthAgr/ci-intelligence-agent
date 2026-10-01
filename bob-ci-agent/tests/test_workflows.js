/**
 * tests/test_workflows.js
 * ========================
 * Unit and integration tests for workflows, safety middleware, and AI provider
 */

'use strict';

const assert = require('assert');
const { validatePrompt } = require('../src/safety/promptGate');
const { validateDeployCommand } = require('../src/safety/deployGuard');
const { MCPClient } = require('../src/mcp/mcpClient');
const { executeTriageWorkflow } = require('../src/workflows/triageWorkflow');
const { executeCoverageWorkflow } = require('../src/workflows/coverageWorkflow');
const { executeReleaseWorkflow } = require('../src/workflows/releaseWorkflow');
const { executeDeployWorkflow } = require('../src/workflows/deployWorkflow');
const { getAIProvider } = require('../src/ai/provider');

async function testWorkflows() {
  console.log('[test_workflows] Starting workflow and safety tests...\n');

  // 1. Test Safety Middleware
  console.log('1. Prompt Gate Safety Middleware');
  const safePrompt = validatePrompt('Why did run-42 fail?');
  assert.strictEqual(safePrompt.allowed, true);
  console.log('  ✓ Safe prompt allowed');

  const unsafePrompt = validatePrompt('deploy to production now');
  assert.strictEqual(unsafePrompt.allowed, false);
  assert.ok(unsafePrompt.reason.includes('Direct production deploys'));
  console.log('  ✓ Unsafe prompt blocked:', unsafePrompt.reason);

  console.log('\n2. Deploy Guard Safety Middleware');
  const safeCommand = validateDeployCommand('kubectl get pods');
  assert.strictEqual(safeCommand.allowed, true);
  console.log('  ✓ Read-only kubectl command allowed');

  const unsafeCommand = validateDeployCommand('kubectl apply -f prod.yaml', { overall: 'BLOCKER' });
  assert.strictEqual(unsafeCommand.allowed, false);
  assert.ok(unsafeCommand.reason.includes('blocked'));
  console.log('  ✓ Deploy command blocked when release status is BLOCKER');

  // 2. Test MCP Workflows with active client
  const mcpClient = new MCPClient();
  await mcpClient.connect();

  console.log('\n3. Triage Workflow');
  const triageResult = await executeTriageWorkflow({ runId: 'run-42', mcpClient });
  assert.strictEqual(triageResult.status, 'failed');
  assert.strictEqual(triageResult.failuresProcessed, 1);
  assert.strictEqual(triageResult.triage[0].recommendedAction, 'revert');
  console.log('  ✓ Triage workflow executed for run-42 → Action:', triageResult.triage[0].recommendedAction);

  console.log('\n4. Coverage Workflow');
  const coverageResult = await executeCoverageWorkflow({ ref: 'feat-auth', mcpClient });
  assert.strictEqual(coverageResult.totalCoveragePct, 68);
  assert.strictEqual(coverageResult.passedThreshold, false);
  console.log('  ✓ Coverage workflow executed for feat-auth → Coverage:', coverageResult.totalCoveragePct, '%');

  console.log('\n5. Release Readiness Workflow');
  const releaseResult = await executeReleaseWorkflow({ ref: 'feat-auth', targetEnv: 'staging', mcpClient });
  assert.strictEqual(releaseResult.overall, 'BLOCKER');
  console.log('  ✓ Release readiness workflow executed for feat-auth → Status:', releaseResult.overall);

  console.log('\n6. Deployment Workflow');
  const deployResult = await executeDeployWorkflow({
    command: 'kubectl apply -f deployment.yaml',
    ref: 'feat-auth',
    targetEnv: 'staging',
    mcpClient,
  });
  assert.strictEqual(deployResult.allowed, false);
  console.log('  ✓ Deploy workflow blocked dangerous command for non-ready ref');

  console.log('\n7. AI Reasoning Layer Query');
  const aiProvider = getAIProvider();
  const aiResult = await aiProvider.query('Why did run-42 fail?', { mcpClient });
  assert.ok(aiResult.answer.includes('Failure Analysis'));
  assert.ok(aiResult.answer.includes('REVERT'));
  console.log('  ✓ AI Reasoning Layer produced structured answer based on MCP tool outputs');

  await mcpClient.close();
  console.log('\n[test_workflows] ALL WORKFLOW AND SAFETY TESTS PASSED');
}

testWorkflows().catch((err) => {
  console.error('\n✗ Workflow test failed:', err);
  process.exit(1);
});
