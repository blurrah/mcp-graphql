# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `bun --watch src/index.ts` - Run the MCP server in development mode with hot reload
- `bun build src/index.ts --outdir dist --target node` - Build the project for distribution
- `bun run format` - Format code using Biome (uses tabs with width 2)
- `bun run check` - Check code formatting without modifying files

### Testing GraphQL Operations
When testing GraphQL file loading functionality:
1. Create `.graphql` or `.gql` files in the `graphql/` directory
2. Run the server with `GRAPHQL_DIR=./graphql bun --watch src/index.ts`
3. Operations are automatically registered as tools with names like `gql-{operation-name}`

## Architecture

### Core Components

**MCP Server Implementation** (`src/index.ts`)
- Uses `@modelcontextprotocol/sdk` to implement a Model Context Protocol server
- Exposes GraphQL operations as MCP tools that LLMs can invoke
- Registers both static tools (`introspect-schema`, `query-graphql`) and dynamic tools from GraphQL files
- Environment-based configuration using Zod schema validation

**GraphQL File Loading System** (`src/helpers/graphql-files.ts`)
- Recursively discovers `.graphql`/`.gql` files in configured directory
- Parses GraphQL operations and extracts variable definitions
- Converts GraphQL variable types to Zod schemas for runtime validation
- Generates tool names in kebab-case format (`gql-{operation-name}`)

**Introspection Helpers** (`src/helpers/introspection.ts`)
- Supports three introspection modes:
  1. Direct endpoint introspection via GraphQL introspection query
  2. Local schema file parsing
  3. Remote schema file fetching from URL
- Returns schema in SDL (Schema Definition Language) format

### Key Design Patterns

**Configuration Precedence**
- Environment variables ALWAYS override config files when set
- Order: Env vars > GraphQL Config > Defaults
- `ALLOW_MUTATIONS` defaults to `false` for safety
- Headers passed as JSON string in `HEADERS` env var
- Supports standard GraphQL Config formats (.graphqlrc.yml, .json, .js)

**Tool Registration Flow**
1. On startup, scan `GRAPHQL_DIR` for GraphQL files
2. Parse each file to extract operations and variables
3. Skip mutations if `ALLOW_MUTATIONS=false`
4. Register each operation as an MCP tool with appropriate Zod schema
5. Tools execute by sending the full operation content to the endpoint

**Security Model**
- Mutations disabled by default
- Same headers/endpoint used for all operations
- No dynamic query construction - only pre-defined operations from files

## Development Guidelines

### Adding New GraphQL Operations
Place `.graphql` files in the `graphql/` directory following this structure:
```
graphql/
├── queries/     # Read operations
└── mutations/   # Write operations (require ALLOW_MUTATIONS=true)
```

### Modifying Core Functionality
- Helper functions go in `src/helpers/` directory
- Use TypeScript strict mode (configured in tsconfig.json)
- Format with Biome using tabs (configured in biome.json)
- Package uses Bun as package manager (bun@1.2.19)

### Dependencies
- **Runtime**: `@modelcontextprotocol/sdk`, `graphql`, `zod`
- **Development**: Uses Bun runtime, TypeScript, Biome formatter
- **GraphQL Tools**: `@graphql-tools/schema` for schema manipulation

## Environment Variables Reference

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `ENDPOINT` | No | `http://localhost:4000/graphql` | GraphQL API endpoint |
| `HEADERS` | No | `{}` | JSON string of request headers |
| `ALLOW_MUTATIONS` | No | `false` | Enable mutation operations |
| `NAME` | No | `mcp-graphql` | MCP server name |
| `SCHEMA` | No | - | Local file path or URL to schema |
| `GRAPHQL_DIR` | No | `./graphql` | Directory for .graphql files |