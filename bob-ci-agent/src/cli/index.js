/**
 * src/cli/index.js
 * ================
 * CLI Router and Interactive Mode for CI Intelligence Agent
 */

'use strict';

const readline = require('readline');
const { MCPClient } = require('../mcp/mcpClient');
const { getAIProvider } = require('../ai/provider');
const { executeTriageWorkflow } = require('../workflows/triageWorkflow');
const { executeCoverageWorkflow } = require('../workflows/coverageWorkflow');
const { executeReleaseWorkflow } = require('../workflows/releaseWorkflow');
const { executeDeployWorkflow } = require('../workflows/deployWorkflow');
const { validatePrompt } = require('../safety/promptGate');
const { runDemo } = require('./demo');

function printHelp() {
  console.log(`
CI Intelligence Agent CLI (ci-agent)

Usage:
  ci-agent                           Run interactive menu mode
  ci-agent demo                      Run deterministic end-to-end demo
  ci-agent pipeline <ref>            Fetch CI pipeline run details (e.g. run-42)
  ci-agent triage <run-id>           Run failure triage and recall historical memory
  ci-agent failure recall [sig]      Query failure memory by signature
  ci-agent coverage <ref>            Fetch test coverage report (e.g. feat-auth)
  ci-agent release-check <ref>       Run release readiness gates (e.g. feat-auth)
  ci-agent deploy-check <cmd>        Evaluate deployment safety guard
  ci-agent ask "<question>"          Ask AI reasoning engine (e.g. "Why did run-42 fail?")

Options:
  --help, -h                         Show this help message
  --version, -v                      Show version
`);
}

async function runInteractive(mcpClient) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (promptText) => new Promise((res) => rl.question(promptText, res));

  console.log('\n==================================================');
  console.log('            CI Intelligence Agent');
  console.log('==================================================\n');

  while (true) {
    console.log(`
1. Run pipeline
2. Analyze failure
3. Recall previous failures
4. Store failure
5. Check coverage
6. Check release readiness
7. Triage failure
8. Deployment safety
9. Exit
`);
    const choice = (await question('Select an option (1-9): ')).trim();

    if (choice === '9' || choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'q') {
      console.log('Goodbye!');
      rl.close();
      break;
    }

    try {
      switch (choice) {
        case '1': {
          const ref = (await question('Enter pipeline reference (e.g. run-42): ')).trim() || 'run-42';
          console.log(`\nFetching pipeline run "${ref}"...`);
          const res = await mcpClient.callTool('run_pipeline', { ref });
          console.log('\nPipeline Result:', JSON.stringify(res, null, 2));
          break;
        }
        case '2':
        case '7': {
          const runId = (await question('Enter run ID to triage (e.g. run-42): ')).trim() || 'run-42';
          console.log(`\nTriaging run "${runId}"...`);
          const res = await executeTriageWorkflow({ runId, mcpClient });
          console.log('\nTriage Result:', JSON.stringify(res, null, 2));
          break;
        }
        case '3': {
          const signature = (await question('Enter failure signature (SHA-256): ')).trim() || 'e05df3df6765b575ef14be0d76c581b5d7e29f641cd5520c270680c0fb63ecde';
          console.log(`\nRecalling failures for signature ${signature.slice(0, 16)}...`);
          const res = await mcpClient.callTool('recall_failures', { signature, limit: 5 });
          console.log('\nFailure Recall Result:', JSON.stringify(res, null, 2));
          break;
        }
        case '4': {
          console.log('\nEnter failure details to store:');
          const test_name = (await question('Test name: ')).trim();
          const error_type = (await question('Error type (e.g. AssertionError): ')).trim();
          const failing_file = (await question('Failing file: ')).trim();
          const signature = (await question('SHA-256 signature (or leave blank to compute): ')).trim() ||
            require('crypto').createHash('sha256').update(`${test_name}:${error_type}:${failing_file}`).digest('hex');
          const action = (await question('Action (rerun/fix/revert/escalate): ')).trim() || 'fix';
          const confidence = (await question('Confidence (high/medium/low): ')).trim() || 'medium';

          const res = await mcpClient.callTool('store_failure', {
            signature,
            test_name,
            error_type,
            failing_file,
            action,
            confidence,
            confidence_score: 0.8,
            recommendation: 'Stored manually from CLI interactive mode',
          });
          console.log('\nStore Result:', JSON.stringify(res, null, 2));
          break;
        }
        case '5': {
          const ref = (await question('Enter ref for coverage (e.g. feat-auth): ')).trim() || 'feat-auth';
          console.log(`\nFetching coverage report for "${ref}"...`);
          const res = await executeCoverageWorkflow({ ref, mcpClient });
          console.log('\nCoverage Report:', JSON.stringify(res, null, 2));
          break;
        }
        case '6': {
          const ref = (await question('Enter ref for release check (e.g. feat-auth): ')).trim() || 'feat-auth';
          const targetEnv = (await question('Target environment [staging]: ')).trim() || 'staging';
          console.log(`\nChecking release readiness for "${ref}" to ${targetEnv}...`);
          const res = await executeReleaseWorkflow({ ref, targetEnv, mcpClient });
          console.log('\nRelease Readiness Result:', JSON.stringify(res, null, 2));
          break;
        }
        case '8': {
          const command = (await question('Enter deploy command (e.g. kubectl apply -f deployment.yaml): ')).trim();
          const ref = (await question('Git ref [feat-auth]: ')).trim() || 'feat-auth';
          console.log(`\nEvaluating deployment safety for "${command}"...`);
          const res = await executeDeployWorkflow({ command, ref, targetEnv: 'staging', mcpClient });
          console.log('\nDeployment Safety Result:', JSON.stringify(res, null, 2));
          break;
        }
        default:
          console.log('Invalid option. Please enter a number between 1 and 9.');
          break;
      }
    } catch (err) {
      console.error('\nError executing command:', err.message);
    }
  }
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return 0;
  }

  if (argv.includes('--version') || argv.includes('-v')) {
    console.log('ci-agent v1.0.0');
    return 0;
  }

  const command = argv[0];

  if (command === 'demo') {
    await runDemo();
    return 0;
  }

  const mcpClient = new MCPClient();

  try {
    if (!command) {
      await mcpClient.connect();
      await runInteractive(mcpClient);
      await mcpClient.close();
      return 0;
    }

    await mcpClient.connect();

    switch (command) {
      case 'pipeline': {
        const ref = argv[1] || 'run-42';
        const res = await mcpClient.callTool('run_pipeline', { ref });
        console.log(JSON.stringify(res, null, 2));
        break;
      }
      case 'triage': {
        const runId = argv[1] || 'run-42';
        const res = await executeTriageWorkflow({ runId, mcpClient });
        console.log(JSON.stringify(res, null, 2));
        break;
      }
      case 'failure': {
        const sub = argv[1];
        if (sub === 'recall') {
          const sig = argv[2] || 'e05df3df6765b575ef14be0d76c581b5d7e29f641cd5520c270680c0fb63ecde';
          const res = await mcpClient.callTool('recall_failures', { signature: sig, limit: 5 });
          console.log(JSON.stringify(res, null, 2));
        } else {
          console.error('Usage: ci-agent failure recall <signature>');
          process.exitCode = 1;
        }
        break;
      }
      case 'coverage': {
        const ref = argv[1] || 'feat-auth';
        const res = await executeCoverageWorkflow({ ref, mcpClient });
        console.log(JSON.stringify(res, null, 2));
        break;
      }
      case 'release-check': {
        const ref = argv[1] || 'feat-auth';
        const targetEnv = argv[2] || 'staging';
        const res = await executeReleaseWorkflow({ ref, targetEnv, mcpClient });
        console.log(JSON.stringify(res, null, 2));
        break;
      }
      case 'deploy-check': {
        const cmdText = argv[1] || 'kubectl apply -f deployment.yaml';
        const ref = argv[2] || 'feat-auth';
        const res = await executeDeployWorkflow({ command: cmdText, ref, mcpClient });
        console.log(JSON.stringify(res, null, 2));
        break;
      }
      case 'ask': {
        const promptText = argv.slice(1).join(' ');
        if (!promptText) {
          console.error('Error: Please provide a prompt, e.g. ci-agent ask "Why did run-42 fail?"');
          process.exitCode = 1;
          break;
        }

        const promptSafety = validatePrompt(promptText);
        if (!promptSafety.allowed) {
          console.error(`\n❌ Prompt Blocked by Safety Guard: ${promptSafety.reason}`);
          process.exitCode = 1;
          break;
        }

        const aiProvider = getAIProvider();
        const res = await aiProvider.query(promptText, { mcpClient });
        console.log('\n' + res.answer + '\n');
        break;
      }
      default:
        console.error(`Unknown command: "${command}"`);
        printHelp();
        process.exitCode = 1;
        break;
    }

    await mcpClient.close();
    return process.exitCode || 0;
  } catch (err) {
    console.error('\nError:', err.message);
    await mcpClient.close();
    process.exitCode = 1;
    return 1;
  }
}

module.exports = { main, printHelp };
