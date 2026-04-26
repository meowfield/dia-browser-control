# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Dia Browser Control extension for Claude Desktop that enables browser automation through Chrome DevTools Protocol on macOS. It provides tools for tab management, navigation, page interaction, and JavaScript execution via a Model Context Protocol (MCP) server.

## Development Commands

```bash
# Install dependencies
npm install

# Run the MCP server
npm start

# Validate the MCP Bundle manifest
npm run validate

# Package the extension (rebuild .mcpb file)
npm run pack

# Test Dia Chrome DevTools Protocol connectivity
npm run test:cdp
```

## Architecture

The project implements an MCP server that bridges Claude Desktop with Dia Browser using Chrome DevTools Protocol.

### Key Components

- **server/index.js**: Main MCP server implementation
  - `DiaBrowserControlServer` class handles tool registration and request routing
  - `executeCDPCommand()` method executes Chrome DevTools Protocol commands
  - `executeHttpCommand()` for simple HTTP API calls to CDP
  - `executeWebSocketCommand()` for complex WebSocket-based CDP commands
  - Comprehensive error handling for browser state and CDP connectivity
  - All 10 browser control tools implemented in the `CallToolRequestSchema` handler

### Tool Implementation Patterns

All tools follow consistent patterns in server/index.js:

1. **Tab ID Resolution**: Most tools accept optional `tab_id` parameter

   - If provided: Use the specific tab ID for CDP commands
   - If omitted: Find active tab via `/json` endpoint and operate on it

2. **CDP Command Execution**:

   - Uses HTTP endpoints for simple operations (list, activate, close tabs)
   - Uses WebSocket connections for complex operations (JavaScript execution, navigation)
   - Error handling for common issues:
     - Connection refused: Dia Browser not running with remote debugging
     - 404 errors: Tab not found or invalid tab ID

3. **JavaScript Execution**:
   - `execute_javascript` tool uses `Runtime.evaluate` CDP method
   - `get_page_content` uses custom DOM traversal to preserve link URLs
   - Format: "link text [URL]" for extracted links
   - Proper error handling for JavaScript exceptions

### Security Architecture

- Requires Dia Browser to be launched with remote debugging enabled
- Opens localhost port 9222 for Chrome DevTools Protocol communication
- Can execute arbitrary JavaScript in browser context
- Extension validates JavaScript URLs to filter out `javascript:void(0)`
- WebSocket connections are secured to localhost only

### Extension Packaging

- **manifest.json**: MCPB extension manifest with tool definitions
- **dia-browser-control.mcpb**: Built extension package (zip archive)
- Platform requirement: macOS (arm64)
- Runtime requirement: Node.js >= 18.0.0
- Browser requirement: Dia Browser 0.38.0+ with remote debugging enabled

## GitHub Actions

The project includes Claude Code GitHub Actions:

- **.github/workflows/claude-code-review.yml**: Automated PR review on open/sync
- **.github/workflows/claude.yml**: Interactive Claude assistant triggered by @claude mentions

## Development Notes

- The `.mcpb` file should not be committed to version control (added to .gitignore)
- CDP WebSocket connections have 10-second timeout for commands
- Link preservation in `get_page_content` uses optimized array joining vs string concatenation
- All tools return consistent JSON response format via MCP protocol
- WebSocket library (`ws`) is required for CDP communication

## Version Management

When updating the extension:
1. Update version in both `manifest.json` and `package.json`
2. Follow semantic versioning: `major.minor.patch`
3. Current version: 0.2.0

## Testing

To test the extension:
1. Launch Dia Browser with remote debugging: `/Applications/Dia.app/Contents/MacOS/Dia --remote-debugging-port=9222`
2. Verify CDP is working: `npm run test:cdp`
3. Run the MCP server: `npm start`
4. Test individual tools through Claude Desktop
