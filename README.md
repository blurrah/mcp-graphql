# mcp-graphql

[![smithery badge](https://smithery.ai/badge/mcp-graphql)](https://smithery.ai/server/mcp-graphql)
Model Context Protocol server for working with GraphQL servers. It's a simple implementation using an introspection query to read the schema and one tool to query your server.

<a href="https://glama.ai/mcp/servers/4zwa4l8utf"><img width="380" height="200" src="https://glama.ai/mcp/servers/4zwa4l8utf/badge" alt="mcp-graphql MCP server" /></a>

## Usage
Run `mcp-graphql` with the correct endpoint, it will automatically try to introspect your queries. You can optionally add a JSON string containing headers if needed.

```bash
# Example using a local GraphQL server which also publicly outputs the GraphQL schema
mcp-graphql --endpoint http://localhost:3000/graphql --headers '{"X-Custom-Header":"foobar"}'
```

### Installing via Smithery

To install GraphQL MCP Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/mcp-graphql):

```bash
npx -y @smithery/cli install mcp-graphql --client claude
```

### Installing Manually
It can be manually installed to Claude:
```json
{
    "mcpServers": {
        "mcp-graphql": {
            "command": "npx",
            "args": ["mcp-graphql", "--endpoint", "http://localhost:3000/graphql"]
        }
    }
}
```
Smithery/Zed extensions will be available in the near future.

## Customize for your own server
This is a very generic implementation where it allows for complete introspection and for your users to do whatever (including mutations). If you need a more specific implementation I'd suggest to just create your own MCP and lock down tool calling for clients to only input specific query fields and/or variables. You can use this as a reference.

## Development

To install dependencies:

```bash
bun install
```

To run for development:

```bash
bun dev
```

To build:

```bash
bun run build
```

