import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { customersTools } from '../tools/core/customers.js';
import type { MySQLClient } from '../mysql-client.js';

// Mock do MySQLClient
const mockQuery = jest.fn() as jest.MockedFunction<any>;
const mockQueryOne = jest.fn() as jest.MockedFunction<any>;
const mockClient = {
  query: mockQuery,
  queryOne: mockQueryOne,
  testConnection: jest.fn(() => Promise.resolve(true)),
  close: jest.fn(() => Promise.resolve())
} as unknown as MySQLClient;

describe('Customers Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('get_customers', () => {
    const getTool = customersTools.find(t => t.name === 'get_customers');

    it('should list customers with default pagination', async () => {
      const mockCustomers = [
        { userid: 1, company: 'Test Company', active: 1 },
        { userid: 2, company: 'Another Company', active: 1 }
      ];
      mockQuery.mockResolvedValueOnce(mockCustomers);

      const result = await getTool!.handler({}, mockClient);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [50, 0]
      );
      
      const response = JSON.parse(result.content[0].text);
      expect(response.customers).toEqual(mockCustomers);
      expect(response.pagination).toEqual({
        limit: 50,
        offset: 0,
        count: 2
      });
    });

    it('should filter by active status', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await getTool!.handler({ active: true }, mockClient);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND c.active = ?'),
        expect.arrayContaining([1])
      );
    });

    it('should filter by search term', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await getTool!.handler({ search: 'test' }, mockClient);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND (c.company LIKE ? OR c.vat LIKE ?)'),
        expect.arrayContaining(['%test%', '%test%'])
      );
    });

    it('should handle custom pagination', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await getTool!.handler({ limit: 10, offset: 20 }, mockClient);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([10, 20])
      );
    });
  });

  describe('get_customer', () => {
    const getTool = customersTools.find(t => t.name === 'get_customer');

    it('should return customer details with contacts', async () => {
      const mockCustomer = {
        userid: 1,
        company: 'Test Company',
        vat: '123456789',
        active: 1
      };
      const mockContacts = [
        { id: 1, firstname: 'John', lastname: 'Doe', email: 'john@test.com' }
      ];

      mockQueryOne.mockResolvedValueOnce(mockCustomer);
      mockQuery.mockResolvedValueOnce(mockContacts);

      const result = await getTool!.handler({ client_id: 1 }, mockClient);

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE c.userid = ?'),
        [1]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM tblcontacts'),
        [1]
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.customer).toMatchObject({
        ...mockCustomer,
        contacts: mockContacts
      });
    });

    it('should return not found message for invalid customer', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await getTool!.handler({ client_id: 999 }, mockClient);

      expect(result.content[0].text).toBe('Cliente não encontrado');
    });
  });

  describe('create_customer', () => {
    const createTool = customersTools.find(t => t.name === 'create_customer');

    it('should create new customer', async () => {
      const newCustomerData = {
        company: 'New Company',
        vat: '987654321',
        phonenumber: '+1234567890',
        city: 'Test City'
      };

      mockQuery.mockResolvedValueOnce([{ insertId: 123 }]);
      mockQueryOne.mockResolvedValueOnce({ userid: 123, ...newCustomerData });

      const result = await createTool!.handler(newCustomerData, mockClient);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tblclients'),
        expect.arrayContaining(['New Company', '987654321'])
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.client_id).toBe(123);
    });

    it('should throw error when company is missing', async () => {
      await expect(createTool!.handler({}, mockClient))
        .rejects
        .toThrow('Campo "company" é obrigatório');
    });
  });

  describe('search_customers', () => {
    const searchTool = customersTools.find(t => t.name === 'search_customers');

    it('should search in multiple fields', async () => {
      const mockResults = [{ userid: 1, company: 'Test' }];
      mockQuery.mockResolvedValueOnce(mockResults);

      const result = await searchTool!.handler({
        query: 'test',
        fields: ['company', 'vat', 'city']
      }, mockClient);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('c.company LIKE ? OR c.vat LIKE ? OR c.city LIKE ?'),
        ['%test%', '%test%', '%test%', 20]
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.fields_searched).toEqual(['company', 'vat', 'city']);
    });

    it('should use default fields when none specified', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await searchTool!.handler({ query: 'test' }, mockClient);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('c.company LIKE ? OR c.vat LIKE ?'),
        ['%test%', '%test%', 20]
      );
    });
  });

  describe('update_customer', () => {
    const updateTool = customersTools.find(t => t.name === 'update_customer');

    it('should update customer fields', async () => {
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await updateTool!.handler({
        client_id: 1,
        company: 'Updated Company',
        active: false
      }, mockClient);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tblclients SET'),
        expect.arrayContaining(['Updated Company', false, 1])
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.affected_rows).toBe(1);
    });

    it('should throw error when no fields to update', async () => {
      await expect(updateTool!.handler({ client_id: 1 }, mockClient))
        .rejects
        .toThrow('Nenhum campo para atualizar');
    });
  });

  describe('customer_analytics', () => {
    const analyticsTool = customersTools.find(t => t.name === 'customer_analytics');

    it('should return customer analytics', async () => {
      const mockAnalytics = {
        total_invoices: 10,
        total_revenue: 50000,
        average_invoice: 5000,
        payment_ratio: 0.8
      };
      mockQueryOne.mockResolvedValueOnce(mockAnalytics);

      const result = await analyticsTool!.handler({
        client_id: 1,
        period: 'year'
      }, mockClient);

      const response = JSON.parse(result.content[0].text);
      expect(response.analytics).toEqual(mockAnalytics);
      expect(response.period).toBe('year');
    });
  });
});