# mcp-graphql

[![smithery badge](https://smithery.ai/badge/mcp-graphql)](https://smithery.ai/server/mcp-graphql)

A Model Context Protocol server that enables LLMs to interact with GraphQL APIs. This implementation provides schema introspection and query execution capabilities, allowing models to discover and use GraphQL APIs dynamically.

<a href="https://glama.ai/mcp/servers/4zwa4l8utf"><img width="380" height="200" src="https://glama.ai/mcp/servers/4zwa4l8utf/badge" alt="mcp-graphql MCP server" /></a>

## Usage

Run `mcp-graphql` with either a GraphQL Config file or environment variables. The server will automatically load your GraphQL operations as MCP tools.

### Configuration Methods

The server supports two configuration methods with clear precedence:

1. **Environment Variables** (highest priority) - Always override other settings
2. **GraphQL Config File** - Standard `.graphqlrc.yml`, `.graphqlrc.json`, or `graphql.config.js`
3. **Default Values** - Built-in fallbacks

#### Precedence Order

Environment variables **always** take precedence over config files. This allows:
- Temporary overrides without changing files
- Different settings per deployment
- Easy debugging and testing
- CI/CD pipeline customization

Example:
```bash
# Override config file temporarily
ENDPOINT=http://staging.api.com/graphql npm start

# The ENDPOINT env var overrides any value in .graphqlrc.yml
```

### GraphQL Config (Recommended)

Create a `.graphqlrc.yml` file in your project root:

```yaml
schema: http://localhost:4000/graphql
documents:
  - './operations/**/*.graphql'
  - './queries/**/*.gql'
extensions:
  endpoints:
    default:
      url: http://localhost:4000/graphql
      headers:
        Authorization: Bearer ${API_TOKEN}
```

**See [`examples/`](./examples) directory for complete configuration examples.**

Supported config formats:
- `.graphqlrc.yml` / `.graphqlrc.yaml`
- `.graphqlrc.json`
- `graphql.config.js` / `graphql.config.ts`
- `.graphqlrc` (JSON or YAML)
- `package.json` (under `graphql` key)

### Environment Variables

> **Note:** Environment variables always take precedence over GraphQL Config values when set.

| Environment Variable | Description | Default |
|----------|-------------|---------|
| `ENDPOINT` | GraphQL endpoint URL | `http://localhost:4000/graphql` |
| `HEADERS` | JSON string containing headers for requests | `{}` |
| `ALLOW_MUTATIONS` | Enable mutation operations (disabled by default) | `false` |
| `NAME` | Name of the MCP server | `mcp-graphql` |
| `SCHEMA` | Path to a local GraphQL schema file or URL (optional) | - |
| `GRAPHQL_DIR` | Directory containing .graphql/.gql files for operations | `./graphql` |

### Examples

```bash
# Basic usage with a local GraphQL server
ENDPOINT=http://localhost:3000/graphql npx mcp-graphql

# Using with custom headers
ENDPOINT=https://api.example.com/graphql HEADERS='{"Authorization":"Bearer token123"}' npx mcp-graphql

# Enable mutation operations
ENDPOINT=http://localhost:3000/graphql ALLOW_MUTATIONS=true npx mcp-graphql

# Using a local schema file instead of introspection
ENDPOINT=http://localhost:3000/graphql SCHEMA=./schema.graphql npx mcp-graphql

# Using a schema file hosted at a URL
ENDPOINT=http://localhost:3000/graphql SCHEMA=https://example.com/schema.graphql npx mcp-graphql

# Using GraphQL files from a custom directory (without config file)
ENDPOINT=http://localhost:3000/graphql GRAPHQL_DIR=./my-queries npx mcp-graphql

# Using GraphQL Config file (recommended)
npx mcp-graphql  # Automatically loads .graphqlrc.yml or other config formats
```

## Resources

- **graphql-schema**: The server exposes the GraphQL schema as a resource that clients can access. This is either the local schema file, a schema file hosted at a URL, or based on an introspection query.

## Available Tools

The server provides several tools:

1. **introspect-schema**: This tool retrieves the GraphQL schema. Use this first if you don't have access to the schema as a resource.
This uses either the local schema file, a schema file hosted at a URL, or an introspection query.

2. **query-graphql**: Execute GraphQL queries against the endpoint. By default, mutations are disabled unless `ALLOW_MUTATIONS` is set to `true`.

3. **Dynamic tools from .graphql files**: Any GraphQL operations defined in `.graphql` or `.gql` files within the `GRAPHQL_DIR` directory are automatically registered as MCP tools. Tool names follow the pattern `gql-{operation-name}` (e.g., `gql-get-user`, `gql-create-post`).

## Configuration Precedence

The server uses a clear precedence order for configuration:

```
1. Environment Variables (highest priority)
2. GraphQL Config File
3. Default Values (lowest priority)
```

This means:
- Setting `ENDPOINT=http://localhost:5000` will **always** override the config file
- Useful for temporary changes without modifying files
- Follows 12-factor app principles

### Migration Guide

To use GraphQL Config while maintaining flexibility:

1. Create a `.graphqlrc.yml` file with your base configuration
2. Use environment variables for deployment-specific overrides
3. Config file paths:
   - `ENDPOINT` overrides `extensions.endpoints.default.url`
   - `HEADERS` overrides `extensions.endpoints.default.headers`
   - `SCHEMA` overrides `schema`
   - `GRAPHQL_DIR` provides fallback if no `documents` in config

## Installation

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
            "args": ["mcp-graphql"],
            "env": {
                "ENDPOINT": "http://localhost:3000/graphql"
            }
        }
    }
}
```

## GraphQL Config Support

The server now supports [GraphQL Config](https://graphql-config.com/), the standard configuration format used by GraphQL tools. This provides:

- **Standard format**: Works with existing GraphQL tooling (VSCode, GraphQL Playground, etc.)
- **Documents field**: Define operation files using glob patterns
- **Multi-project support**: Different configurations for different environments
- **Environment interpolation**: Use `${ENV_VAR}` in config values
- **Schema validation**: Validate operations against your schema

### Benefits of GraphQL Config

- Version control your GraphQL operations
- Share configuration across tools (IDEs, linters, code generators)
- Organize operations by type or domain
- Type-check operations against your schema

### Examples

The [`examples/`](./examples) directory contains:
- **Configuration examples** in YAML, JSON, and JavaScript formats
- **GraphQL operation examples** for queries and mutations
- **Multi-project setup** for managing multiple APIs

Quick start:
```bash
# Copy an example config to your project
cp examples/config/graphqlrc.yml .graphqlrc.yml

# View example operations
ls examples/graphql/
```

### Operation Files

Define your GraphQL operations in `.graphql` or `.gql` files:

```graphql
# getUser.graphql
query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    email
  }
}
```

This operation becomes available as the `gql-get-user` MCP tool.

**See [`examples/graphql/`](./examples/graphql) for more operation examples.**

### Naming Conventions

- Operations with explicit names use that name (e.g., `query GetUser` → `gql-get-user`)
- Operations without names use the filename (e.g., `userProfile.graphql` → `gql-user-profile`)
- Multi-project operations include project name (e.g., `gql-production-get-user`)
- Names are converted to kebab-case for consistency

## Security Considerations

Mutations are disabled by default as a security measure to prevent an LLM from modifying your database or service data. Consider carefully before enabling mutations in production environments.

When using GraphQL files:
- Mutation operations in `.graphql` files are skipped unless `ALLOW_MUTATIONS=true`
- Each operation is executed with the same headers and endpoint configuration

## Customize for your own server

This is a very generic implementation where it allows for complete introspection and for your users to do whatever (including mutations). If you need a more specific implementation I'd suggest to just create your own MCP and lock down tool calling for clients to only input specific query fields and/or variables. You can use this as a reference.
