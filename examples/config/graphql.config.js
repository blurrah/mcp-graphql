// GraphQL Config in JavaScript format
// Rename to graphql.config.js to use

module.exports = {
  // Schema can be a function for dynamic resolution
  schema: async () => {
    const endpoint = process.env.SCHEMA || 'http://localhost:4000/graphql';
    return endpoint;
  },
  
  // Documents - GraphQL operations to load
  documents: [
    './examples/graphql/**/*.graphql',
    './examples/graphql/**/*.gql'
  ],
  
  // Extensions for additional configuration
  extensions: {
    // Endpoint configuration
    endpoints: {
      default: {
        url: process.env.ENDPOINT || 'http://localhost:4000/graphql',
        headers: () => ({
          'Authorization': `Bearer ${process.env.API_TOKEN || ''}`,
          'Content-Type': 'application/json',
          // Add custom headers dynamically
          ...(process.env.CUSTOM_HEADERS ? JSON.parse(process.env.CUSTOM_HEADERS) : {})
        })
      }
    },
    
    // Custom configuration for MCP
    mcp: {
      // Allow mutations (default: false)
      allowMutations: process.env.ALLOW_MUTATIONS === 'true',
      // Tool name prefix
      toolPrefix: 'gql',
      // Max operations to load (prevent overload)
      maxOperations: 100
    }
  },
  
  // Multi-project configuration example
  // Uncomment to use multiple projects
  /*
  projects: {
    production: {
      schema: 'https://api.example.com/graphql',
      documents: './examples/graphql/production/*.graphql',
      extensions: {
        endpoints: {
          default: {
            url: 'https://api.example.com/graphql',
            headers: {
              'Authorization': `Bearer ${process.env.PROD_TOKEN}`
            }
          }
        }
      }
    },
    
    development: {
      schema: 'http://localhost:4000/graphql',
      documents: './examples/graphql/dev/*.graphql',
      extensions: {
        endpoints: {
          default: {
            url: 'http://localhost:4000/graphql',
            headers: {
              'Authorization': `Bearer ${process.env.DEV_TOKEN}`
            }
          }
        }
      }
    }
  }
  */
};