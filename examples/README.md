# MCP GraphQL Examples

This directory contains examples for configuring and using the MCP GraphQL server.

## Directory Structure

```
examples/
├── config/           # Configuration file examples
│   ├── graphqlrc.yml     # YAML format (recommended)
│   ├── graphqlrc.json    # JSON format
│   └── graphql.config.js # JavaScript format (dynamic config)
└── graphql/          # Example GraphQL operations
    ├── queries/      # Query operations
    └── mutations/    # Mutation operations
```

## Configuration Examples

### Basic Configuration (graphqlrc.yml)

The simplest configuration using YAML format:

```yaml
schema: http://localhost:4000/graphql
documents:
  - './examples/graphql/**/*.graphql'
```

### JSON Configuration (graphqlrc.json)

Same configuration in JSON format:

```json
{
  "schema": "http://localhost:4000/graphql",
  "documents": ["./examples/graphql/**/*.graphql"]
}
```

### JavaScript Configuration (graphql.config.js)

Dynamic configuration with environment variables:

```javascript
module.exports = {
  schema: process.env.GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql',
  documents: ['./examples/graphql/**/*.graphql'],
  extensions: {
    endpoints: {
      default: {
        url: process.env.GRAPHQL_ENDPOINT,
        headers: {
          'Authorization': `Bearer ${process.env.API_TOKEN}`
        }
      }
    }
  }
};
```

## GraphQL Operation Examples

### Query Examples

**getUser.graphql** - Fetch a user by ID:
```graphql
query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    email
    createdAt
  }
}
```

**listPosts.graphql** - List posts with pagination:
```graphql
query ListPosts($limit: Int = 10, $offset: Int = 0) {
  posts(limit: $limit, offset: $offset) {
    id
    title
    content
    author {
      id
      name
    }
  }
}
```

### Mutation Examples

**createPost.graphql** - Create a new post:
```graphql
mutation CreatePost($title: String!, $content: String!, $authorId: ID!) {
  createPost(input: {
    title: $title,
    content: $content,
    authorId: $authorId
  }) {
    id
    title
    content
  }
}
```

## Using the Examples

1. **Copy a config file to your project root:**
   ```bash
   cp examples/config/graphqlrc.yml .graphqlrc.yml
   ```

2. **Adjust the configuration:**
   - Update the `schema` to point to your GraphQL endpoint
   - Modify `documents` paths to match your file structure
   - Add authentication headers if needed

3. **Create your own operations:**
   - Place `.graphql` files in your project
   - Reference them in the `documents` field
   - They'll automatically become available as MCP tools

## Multi-Project Setup

For multiple GraphQL APIs, use the projects configuration:

```yaml
projects:
  production:
    schema: https://api.example.com/graphql
    documents: './operations/production/**/*.graphql'
    extensions:
      endpoints:
        default:
          url: https://api.example.com/graphql
          headers:
            Authorization: Bearer ${PROD_TOKEN}
  
  development:
    schema: http://localhost:4000/graphql
    documents: './operations/dev/**/*.graphql'
```

Tools will be named: `gql-production-{operation}` and `gql-development-{operation}`

## Environment Variables

GraphQL Config supports environment variable interpolation using `${VAR_NAME}`:

```yaml
schema: ${GRAPHQL_SCHEMA}
extensions:
  endpoints:
    default:
      url: ${GRAPHQL_ENDPOINT}
      headers:
        Authorization: Bearer ${API_TOKEN}
```

## Tool Naming

Operations are exposed as MCP tools with the following naming convention:
- Single project: `gql-{operation-name}`
- Multi-project: `gql-{project}-{operation-name}`
- Names are converted to kebab-case

Examples:
- `GetUser` → `gql-get-user`
- `CreatePost` → `gql-create-post`
- Production `GetUser` → `gql-production-get-user`