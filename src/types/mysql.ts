import {
  ResultSetHeader as MySQLResultSetHeader,
  RowDataPacket as MySQLRowDataPacket
} from 'mysql2';

// Re-export mysql2 types
export type ResultSetHeader = MySQLResultSetHeader;
export type RowDataPacket = MySQLRowDataPacket;

// Type guards
export function isResultSetHeader(result: any): result is ResultSetHeader {
  return result && typeof result.insertId !== 'undefined';
}

// Generic query result types
export type QueryResult<T = any> = T & RowDataPacket;
export type QueryResults<T = any> = (T & RowDataPacket)[];

// Helper type for row data
export type DatabaseRow<T = any> = T & RowDataPacket;
