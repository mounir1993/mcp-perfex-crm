# Contributing to MCP Perfex CRM

Welcome to contributing to MCP Perfex CRM! This guide will help you get started with contributing to our high-performance Model Context Protocol server.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MySQL/MariaDB
- Git configured with GitHub account
- Perfex CRM instance for testing

### Development Setup

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/mcp-perfex-crm.git
cd mcp-perfex-crm

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your database settings

# Start development
npm run dev
```

## 📝 Code Standards

### TypeScript Guidelines

```typescript
// ✅ Good: Explicit types
interface CustomerData {
  id: number;
  company: string;
  active: boolean;
}

// ✅ Good: Proper error handling
try {
  const result = await mysqlClient.query(sql, params);
  return { success: true, data: result };
} catch (error) {
  logger.error('Operation failed:', error);
  return {
    content: [{
      type: 'text',
      text: `Error: ${error instanceof Error ? error.message : String(error)}`
    }]
  };
}

// ✅ Good: Prepared statements
const customers = await mysqlClient.query(
  'SELECT * FROM tblclients WHERE active = ? AND company LIKE ?',
  [true, `%${search}%`]
);
```

### Tool Creation Template

```typescript
// src/tools/core/example.ts
import { MySQLClient } from '../../mysql-client.js';
import { DatabaseRow } from '../../types/mysql.js';
import { ToolResponse } from '../../types/tools.js';
import { logger } from '../../utils/logger.js';

export interface ExampleTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<ToolResponse>;
}

const getExample: ExampleTool = {
  name: 'get_example',
  description: 'Get example data with filters',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Maximum results' },
      search: { type: 'string', description: 'Search term' }
    }
  },
  handler: async (args, mysqlClient) => {
    try {
      const { limit = 50, search } = args;
      
      // Build query with proper escaping
      const whereConditions = [];
      const queryParams: any[] = [];
      
      if (search) {
        whereConditions.push('name LIKE ?');
        queryParams.push(`%${search}%`);
      }
      
      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}` 
        : '';
      
      const query = `
        SELECT id, name, description, created_at
        FROM example_table
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ?
      `;
      
      queryParams.push(limit);
      
      const results = await mysqlClient.query<DatabaseRow>(query, queryParams);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            count: results.length,
            data: results
          }, null, 2)
        }]
      };
      
    } catch (error) {
      logger.error('Error in get_example:', error);
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
};

export const exampleTools: ExampleTool[] = [
  getExample
];
```

## 🧪 Testing

### Test Structure
```typescript
// src/__tests__/example.test.ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { exampleTools } from '../tools/core/example.js';
import type { MySQLClient } from '../mysql-client.js';

const mockQuery = jest.fn() as jest.MockedFunction<any>;
const mockClient = {
  query: mockQuery,
  queryOne: jest.fn(),
  testConnection: jest.fn(() => Promise.resolve(true)),
  close: jest.fn(() => Promise.resolve())
} as unknown as MySQLClient;

describe('Example Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('get_example', () => {
    const getTool = exampleTools.find(t => t.name === 'get_example');

    it('should return example data', async () => {
      const mockData = [{ id: 1, name: 'Test' }];
      mockQuery.mockResolvedValueOnce(mockData);

      const result = await getTool!.handler({}, mockClient);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [50]
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockData);
    });
  });
});
```

### Running Tests
```bash
npm test              # Run all tests
npm run test:coverage # Run with coverage
npm run lint          # Check code style
npm run build         # Build project
```

## 🔄 Pull Request Process

1. **Create feature branch**: `git checkout -b feature/your-feature`
2. **Make changes** following code standards
3. **Add tests** for new functionality
4. **Update documentation** if needed
5. **Run tests**: `npm test && npm run lint`
6. **Submit PR** with clear description

### Commit Messages
Follow conventional commits:
```
feat(invoices): add payment recording functionality
fix(database): resolve connection pool exhaustion
docs(readme): update installation instructions
```

## 📚 Documentation

### Code Comments
```typescript
/**
 * Retrieves customer information with optional filtering
 * 
 * @param args - Query parameters including filters and pagination
 * @param mysqlClient - Database client instance
 * @returns Promise resolving to formatted customer data
 * 
 * @example
 * ```typescript
 * const result = await getCustomers({
 *   limit: 10,
 *   active: true,
 *   search: 'company name'
 * }, mysqlClient);
 * ```
 */
```

### API Documentation
Document tool schemas clearly:
```typescript
const getCustomers: CustomerTool = {
  name: 'get_customers',
  description: 'List customers with optional filtering and pagination',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { 
        type: 'number', 
        description: 'Maximum number of customers (1-1000)',
        minimum: 1,
        maximum: 1000,
        default: 50
      },
      search: { 
        type: 'string', 
        description: 'Search term for company name, VAT, email',
        maxLength: 255
      }
    }
  }
  // Implementation...
};
```

## 🐛 Issue Reporting

### Bug Reports
```markdown
## Bug Description
Clear description of the issue

## Steps to Reproduce
1. Step one
2. Step two  
3. Step three

## Expected vs Actual Behavior
What should happen vs what actually happens

## Environment
- OS: Ubuntu 22.04
- Node.js: 20.0.0
- MySQL: 8.0.34
- MCP Perfex CRM: 1.0.0

## Error Logs
```
Paste error logs here
```
```

### Feature Requests
```markdown
## Feature Description
Clear description of proposed feature

## Use Case
Why is this feature needed?

## Proposed Solution
How should this work?

## Implementation Notes
Technical considerations
```

## 🌟 Community Guidelines

### Code of Conduct
- Be respectful and inclusive
- Focus on technical merit
- Accept constructive criticism
- Help newcomers learn

### Recognition
Contributors are recognized in:
- README.md contributors section
- CHANGELOG.md for significant contributions
- GitHub releases with mentions

---

**Thank you for contributing to MCP Perfex CRM! Together we're building the best Perfex CRM integration tool.**

For questions: Open a GitHub Discussion or contact maintainers.