/**
 * src/mcp/mcpClient.js
 * ====================
 * Standalone MCP Client
 * 
 * Manages connection to the Node.js MCP server over STDIO transport.
 * Independent of IBM Bob or any specific client runtime.
 */

'use strict';

const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

class MCPClient {
  /**
   * @param {object} [options]
   * @param {string} [options.serverScriptPath] - Absolute path to server.js
   */
  constructor(options = {}) {
    this.serverScriptPath = options.serverScriptPath || path.resolve(__dirname, '..', '..', 'mcp', 'server.js');
    this.client = null;
    this.transport = null;
    this.isConnected = false;
  }

  /**
   * Connects to the MCP server via STDIO.
   */
  async connect() {
    if (this.isConnected) return;

    this.transport = new StdioClientTransport({
      command: process.execPath, // node
      args: [this.serverScriptPath],
      env: process.env,
    });

    this.client = new Client(
      { name: 'ci-agent-cli-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await this.client.connect(this.transport);
    this.isConnected = true;
  }

  /**
   * Discovers available tools from the server.
   * @returns {Promise<object[]>} List of tool schema objects
   */
  async listTools() {
    if (!this.isConnected) await this.connect();
    const result = await this.client.listTools();
    return result.tools || [];
  }

  /**
   * Calls an MCP tool by name with arguments.
   * @param {string} name 
   * @param {object} [args] 
   * @returns {Promise<object>} Parsed tool result content
   */
  async callTool(name, args = {}) {
    if (!this.isConnected) await this.connect();

    const response = await this.client.callTool({
      name,
      arguments: args,
    });

    if (response.isError) {
      const errorText = response.content?.[0]?.text ?? 'Unknown MCP error';
      let parsedError;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        parsedError = { error: errorText };
      }
      throw new Error(parsedError.error || errorText);
    }

    const textContent = response.content?.[0]?.text;
    if (!textContent) return {};

    try {
      return JSON.parse(textContent);
    } catch {
      return { raw: textContent };
    }
  }

  /**
   * Closes the MCP connection cleanly.
   */
  async close() {
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (err) {
        // Ignore close error
      }
    }
    this.isConnected = false;
    this.client = null;
    this.transport = null;
  }
}

module.exports = { MCPClient };
