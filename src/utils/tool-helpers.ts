import { ToolResponse } from '../types/tools.js';

/**
 * Creates a successful tool response with JSON data
 */
export function createSuccessResponse(data: any): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

/**
 * Creates an error tool response
 */
export function createErrorResponse(message: string): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: message
      }
    ]
  };
}

/**
 * Creates a simple text response
 */
export function createTextResponse(text: string): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text
      }
    ]
  };
}

/**
 * Validates required fields in arguments
 */
export function validateRequiredFields<T extends Record<string, any>>(
  args: T,
  requiredFields: (keyof T)[]
): void {
  for (const field of requiredFields) {
    if (args[field] === undefined || args[field] === null) {
      throw new Error(`Campo "${String(field)}" é obrigatório`);
    }
  }
}

/**
 * Builds WHERE clause conditions from filters
 */
export function buildWhereConditions(
  filters: Record<string, any>,
  fieldMappings: Record<string, string> = {}
): { conditions: string[]; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      const field = fieldMappings[key] || key;
      conditions.push(`${field} = ?`);
      params.push(value);
    }
  }

  return { conditions, params };
}

/**
 * Formats date for MySQL
 */
export function formatDateForMySQL(date: Date | string): string {
  if (typeof date === 'string') {
    return date;
  }
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Parses boolean-like values
 */
export function parseBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  return false;
}
