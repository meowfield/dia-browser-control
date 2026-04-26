#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { WebSocket } from 'ws';

class DiaBrowserControlServer {
  constructor() {
    this.server = new Server(
      {
        name: 'dia-browser-control',
        version: '0.2.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.cdpHost = '127.0.0.1';
    this.cdpPort = 9222;
    this.cdpBaseUrl = `http://${this.cdpHost}:${this.cdpPort}`;
    this.nextCommandId = 1;
    this.setupHandlers();
  }

  isConnectionError(error) {
    const code = error?.code || error?.cause?.code;
    return ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'].includes(code)
      || error?.message === 'fetch failed'
      || error?.message?.includes('ECONNREFUSED');
  }

  createRemoteDebuggingError() {
    return new Error(
      'Dia Browser is not running with remote debugging enabled.\n\n' +
      'To enable remote debugging:\n' +
      '1. Close Dia Browser completely\n' +
      '2. Launch Dia Browser with: /Applications/Dia.app/Contents/MacOS/Dia --remote-debugging-port=9222\n' +
      '3. Or add --remote-debugging-port=9222 to your Dia Browser startup flags\n\n' +
      'Note: Remote debugging must be enabled for this extension to work.'
    );
  }

  async executeCDPCommand(method, params = {}, targetId = null) {
    try {
      if (targetId) {
        // Use WebSocket for commands that require a specific target
        return await this.executeWebSocketCommand(method, params, targetId);
      } else {
        // Use HTTP for simple commands
        return await this.executeHttpCommand(method, params);
      }
    } catch (error) {
      console.error('CDP execution error:', error);

      // Check for Dia Browser not running or CDP not enabled
      if (this.isConnectionError(error)) {
        throw this.createRemoteDebuggingError();
      }

      throw new Error(`CDP error: ${error.message}`);
    }
  }

  async executeHttpCommand(endpoint, params = {}, method = 'GET') {
    const url = new URL(endpoint, this.cdpBaseUrl);

    // Add query parameters if provided
    Object.keys(params).forEach(key => {
      url.searchParams.append(key, params[key]);
    });

    let response;
    try {
      response = await fetch(url.toString(), {
        method: method
      });
    } catch (error) {
      if (this.isConnectionError(error)) {
        throw this.createRemoteDebuggingError();
      }
      throw error;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  }

  async executeWebSocketCommand(method, params = {}, targetId) {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://${this.cdpHost}:${this.cdpPort}/devtools/page/${targetId}`;
      const ws = new WebSocket(wsUrl);
      const commandId = this.nextCommandId++;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket command timeout'));
      }, 10000); // 10 second timeout

      ws.on('open', () => {
        const command = {
          id: commandId,
          method: method,
          params: params
        };
        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === commandId) {
            clearTimeout(timeout);
            ws.close();

            if (response.error) {
              reject(new Error(`CDP error: ${response.error.message}`));
            } else {
              resolve(response.result);
            }
          }
        } catch (error) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(`Failed to parse WebSocket response: ${error.message}`));
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        if (this.isConnectionError(error)) {
          reject(this.createRemoteDebuggingError());
        } else {
          reject(new Error(`WebSocket error: ${error.message}`));
        }
      });
    });
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'open_url',
          description: 'Open a URL in Dia Browser',
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to open' },
              new_tab: { type: 'boolean', description: 'Open in a new tab', default: true }
            },
            required: ['url']
          }
        },
        {
          name: 'get_current_tab',
          description: 'Get information about the current active tab',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'list_tabs',
          description: 'List all open tabs in Dia Browser',
          inputSchema: {
            type: 'object',
            properties: {
              window_id: { type: 'number', description: 'Specific window ID to list tabs from' }
            }
          }
        },
        {
          name: 'close_tab',
          description: 'Close a specific tab',
          inputSchema: {
            type: 'object',
            properties: {
              tab_id: { type: 'string', description: 'ID of the tab to close' }
            },
            required: ['tab_id']
          }
        },
        {
          name: 'switch_to_tab',
          description: 'Switch to a specific tab',
          inputSchema: {
            type: 'object',
            properties: {
              tab_id: { type: 'string', description: 'ID of the tab to switch to' }
            },
            required: ['tab_id']
          }
        },
        {
          name: 'reload_tab',
          description: 'Reload a tab',
          inputSchema: {
            type: 'object',
            properties: {
              tab_id: { type: 'string', description: 'ID of the tab to reload' }
            }
          }
        },
        {
          name: 'go_back',
          description: 'Navigate back in browser history',
          inputSchema: {
            type: 'object',
            properties: {
              tab_id: { type: 'string', description: 'ID of the tab' }
            }
          }
        },
        {
          name: 'go_forward',
          description: 'Navigate forward in browser history',
          inputSchema: {
            type: 'object',
            properties: {
              tab_id: { type: 'string', description: 'ID of the tab' }
            }
          }
        },
        {
          name: 'execute_javascript',
          description: 'Execute JavaScript in the current tab',
          inputSchema: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'JavaScript code to execute' },
              tab_id: { type: 'string', description: 'ID of the tab' }
            },
            required: ['code']
          }
        },
        {
          name: 'get_page_content',
          description: 'Get the text content of the current page',
          inputSchema: {
            type: 'object',
            properties: {
              tab_id: { type: 'string', description: 'ID of the tab' }
            }
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'open_url': {
            const { url, new_tab = true } = args;

            if (new_tab) {
              // Create new tab - Dia Browser requires PUT method
              await this.executeHttpCommand(`/json/new?${encodeURIComponent(url)}`, {}, 'PUT');
              return { content: [{ type: 'text', text: `Opened ${url} in new tab` }] };
            } else {
              // Navigate current tab
              const tabs = await this.executeHttpCommand('/json');
              const activeTab = tabs.find(tab => tab.type === 'page');

              if (!activeTab) {
                throw new Error('No active tab found');
              }

              await this.executeWebSocketCommand('Page.navigate', { url }, activeTab.id);
              return { content: [{ type: 'text', text: `Navigated to ${url}` }] };
            }
          }

          case 'get_current_tab': {
            const tabs = await this.executeHttpCommand('/json');
            const activeTab = tabs.find(tab => tab.type === 'page');

            if (!activeTab) {
              throw new Error('No active tab found');
            }

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  url: activeTab.url,
                  title: activeTab.title,
                  id: activeTab.id
                }, null, 2)
              }]
            };
          }

          case 'list_tabs': {
            const tabs = await this.executeHttpCommand('/json');
            const pageTabs = tabs.filter(tab => tab.type === 'page').map(tab => ({
              id: tab.id,
              url: tab.url,
              title: tab.title
            }));

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(pageTabs, null, 2)
              }]
            };
          }

          case 'close_tab': {
            const { tab_id } = args;

            try {
              const result = await this.executeHttpCommand(`/json/close/${tab_id}`);
              return { content: [{ type: 'text', text: 'Tab closed' }] };
            } catch (error) {
              if (error.message.includes('404')) {
                return { content: [{ type: 'text', text: 'Tab not found' }] };
              }
              throw error;
            }
          }

          case 'switch_to_tab': {
            const { tab_id } = args;

            try {
              const result = await this.executeHttpCommand(`/json/activate/${tab_id}`);
              return { content: [{ type: 'text', text: 'Switched to tab' }] };
            } catch (error) {
              if (error.message.includes('404')) {
                return { content: [{ type: 'text', text: 'Tab not found' }] };
              }
              throw error;
            }
          }

          case 'reload_tab': {
            const { tab_id } = args;

            let targetId = tab_id;
            if (!targetId) {
              // Get current active tab
              const tabs = await this.executeHttpCommand('/json');
              const activeTab = tabs.find(tab => tab.type === 'page');
              if (!activeTab) {
                throw new Error('No active tab found');
              }
              targetId = activeTab.id;
            }

            try {
              await this.executeWebSocketCommand('Page.reload', {}, targetId);
              return { content: [{ type: 'text', text: 'Tab reloaded' }] };
            } catch (error) {
              return { content: [{ type: 'text', text: 'Tab not found' }] };
            }
          }

          case 'go_back': {
            const { tab_id } = args;

            let targetId = tab_id;
            if (!targetId) {
              // Get current active tab
              const tabs = await this.executeHttpCommand('/json');
              const activeTab = tabs.find(tab => tab.type === 'page');
              if (!activeTab) {
                throw new Error('No active tab found');
              }
              targetId = activeTab.id;
            }

            try {
              // Get navigation history first
              const history = await this.executeWebSocketCommand('Page.getNavigationHistory', {}, targetId);
              if (history.currentIndex > 0) {
                const entryId = history.entries[history.currentIndex - 1].id;
                await this.executeWebSocketCommand('Page.navigateToHistoryEntry', { entryId }, targetId);
                return { content: [{ type: 'text', text: 'Navigated back' }] };
              } else {
                return { content: [{ type: 'text', text: 'Cannot go back - at beginning of history' }] };
              }
            } catch (error) {
              return { content: [{ type: 'text', text: 'Tab not found or navigation failed' }] };
            }
          }

          case 'go_forward': {
            const { tab_id } = args;

            let targetId = tab_id;
            if (!targetId) {
              // Get current active tab
              const tabs = await this.executeHttpCommand('/json');
              const activeTab = tabs.find(tab => tab.type === 'page');
              if (!activeTab) {
                throw new Error('No active tab found');
              }
              targetId = activeTab.id;
            }

            try {
              // Get navigation history first
              const history = await this.executeWebSocketCommand('Page.getNavigationHistory', {}, targetId);
              if (history.currentIndex < history.entries.length - 1) {
                const entryId = history.entries[history.currentIndex + 1].id;
                await this.executeWebSocketCommand('Page.navigateToHistoryEntry', { entryId }, targetId);
                return { content: [{ type: 'text', text: 'Navigated forward' }] };
              } else {
                return { content: [{ type: 'text', text: 'Cannot go forward - at end of history' }] };
              }
            } catch (error) {
              return { content: [{ type: 'text', text: 'Tab not found or navigation failed' }] };
            }
          }

          case 'execute_javascript': {
            const { code, tab_id } = args;

            let targetId = tab_id;
            if (!targetId) {
              // Get current active tab
              const tabs = await this.executeHttpCommand('/json');
              const activeTab = tabs.find(tab => tab.type === 'page');
              if (!activeTab) {
                throw new Error('No active tab found');
              }
              targetId = activeTab.id;
            }

            try {
              const result = await this.executeWebSocketCommand('Runtime.evaluate', {
                expression: code,
                returnByValue: true,
                awaitPromise: true
              }, targetId);

              if (result.exceptionDetails) {
                return { content: [{ type: 'text', text: `JavaScript error: ${result.exceptionDetails.text}` }] };
              }

              const value = result.result.value;
              return { content: [{ type: 'text', text: value !== undefined ? String(value) : 'JavaScript executed' }] };
            } catch (error) {
              return { content: [{ type: 'text', text: 'Tab not found or JavaScript execution failed' }] };
            }
          }

          case 'get_page_content': {
            const { tab_id } = args;

            let targetId = tab_id;
            if (!targetId) {
              // Get current active tab
              const tabs = await this.executeHttpCommand('/json');
              const activeTab = tabs.find(tab => tab.type === 'page');
              if (!activeTab) {
                throw new Error('No active tab found');
              }
              targetId = activeTab.id;
            }

            // Optimized JavaScript function for extracting page content with preserved links
            const getContentWithLinksScript = `
              function getContentWithLinks() {
                function extractTextWithLinks(element) {
                  const parts = [];
                  for (let node of element.childNodes) {
                    if (node.nodeType === Node.TEXT_NODE) {
                      parts.push(node.textContent);
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                      if (node.tagName === 'A' && node.href) {
                        const linkText = node.textContent.trim();
                        const href = node.href;
                        // Only include valid links with both text and href
                        if (linkText && href && href !== 'javascript:void(0)') {
                          parts.push(linkText + ' [' + href + ']');
                        } else if (linkText) {
                          parts.push(linkText);
                        }
                      } else {
                        parts.push(extractTextWithLinks(node));
                      }
                    }
                  }
                  return parts.join('');
                }
                return extractTextWithLinks(document.body);
              }
              getContentWithLinks();
            `;

            try {
              const result = await this.executeWebSocketCommand('Runtime.evaluate', {
                expression: getContentWithLinksScript,
                returnByValue: true,
                awaitPromise: true
              }, targetId);

              if (result.exceptionDetails) {
                return { content: [{ type: 'text', text: `Error getting page content: ${result.exceptionDetails.text}` }] };
              }

              return { content: [{ type: 'text', text: result.result.value || 'No content found' }] };
            } catch (error) {
              return { content: [{ type: 'text', text: 'Tab not found or failed to get page content' }] };
            }
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Dia Browser Control MCP server running on stdio');
  }
}

const server = new DiaBrowserControlServer();
server.run().catch(console.error);
