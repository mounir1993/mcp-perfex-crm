import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MySQLClient } from '../mysql-client.js';

// Mock simples para mysql2/promise
const mockQuery = jest.fn() as jest.MockedFunction<any>;
const mockEnd = jest.fn() as jest.MockedFunction<any>;
const mockRelease = jest.fn() as jest.MockedFunction<any>;

const mockConnection = {
  query: mockQuery,
  release: mockRelease
};

const mockPool = {
  getConnection: jest.fn(() => Promise.resolve(mockConnection)),
  query: mockQuery,
  end: mockEnd
};

jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => mockPool)
}));

describe('MySQLClient', () => {
  let client: MySQLClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new MySQLClient(
      {
        host: 'localhost',
        port: 3306,
        user: 'test',
        password: 'test',
        database: 'test_db'
      },
      'test-client'
    );
  });

  afterEach(async () => {
    await client.close();
  });

  describe('testConnection', () => {
    it('should return true when connection is successful', async () => {
      mockQuery.mockResolvedValueOnce([[], []]);

      const result = await client.testConnection();

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return false when connection fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('query', () => {
    it('should execute query and return results', async () => {
      const expectedResults = [{ id: 1, name: 'Test' }];
      mockQuery.mockResolvedValueOnce([expectedResults, []]);

      const results = await client.query('SELECT * FROM users WHERE id = ?', [1]);

      expect(results).toEqual(expectedResults);
      expect(mockConnection.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', [1]);
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should release connection even on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Query failed'));

      await expect(client.query('SELECT * FROM invalid')).rejects.toThrow('Query failed');
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should sanitize SQL input', async () => {
      mockQuery.mockResolvedValueOnce([[], []]);

      await client.query('SELECT * FROM users WHERE name = ?', ["'; DROP TABLE users; --"]);

      expect(mockConnection.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE name = ?',
        ["'; DROP TABLE users; --"]
      );
    });
  });

  describe('queryOne', () => {
    it('should return first row when results exist', async () => {
      const rows = [
        { id: 1, name: 'First' },
        { id: 2, name: 'Second' }
      ];
      mockQuery.mockResolvedValueOnce([rows, []]);

      const result = await client.queryOne('SELECT * FROM users');

      expect(result).toEqual({ id: 1, name: 'First' });
    });

    it('should return null when no results', async () => {
      mockQuery.mockResolvedValueOnce([[], []]);

      const result = await client.queryOne('SELECT * FROM users WHERE id = ?', [999]);

      expect(result).toBeNull();
    });
  });

  describe('transaction handling', () => {
    it('should handle multiple queries in sequence', async () => {
      mockQuery
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([[{ id: 1 }], []])
        .mockResolvedValueOnce([[], []]);

      await client.query('START TRANSACTION');
      const result = await client.query('INSERT INTO users (name) VALUES (?)', ['Test']);
      await client.query('COMMIT');

      expect(mockQuery).toHaveBeenCalledTimes(3);
    });
  });

  describe('close', () => {
    it('should close the connection pool', async () => {
      await client.close();

      expect(mockEnd).toHaveBeenCalled();
    });
  });
});