import { z } from 'zod';

// Lista branca de tabelas permitidas
const ALLOWED_TABLES = [
  'tblclients',
  'tblcontacts',
  'tblinvoices',
  'tblinvoice_products',
  'tblinvoicepaymentrecords',
  'tblprojects',
  'tblproject_members',
  'tblproject_files',
  'tbltasks',
  'tbltask_assigned',
  'tbltaskstimers',
  'tblmilestones',
  'tblstaff',
  'tbldepartments',
  'tblleads',
  'tblproposals',
  'tblestimates',
  'tblcontracts',
  'tblexpenses',
  'tblexpenses_categories',
  'tbltaxes',
  'tblcurrencies',
  'tblpayment_modes',
  'tbltickets',
  'tblticket_replies',
  'tblacc_accounts',
  'tblacc_account_history',
  'tblacc_budgets',
  'tblacc_budget_details',
  'tblacc_transfers',
  'tblacc_reconciles',
  'tblacc_journal_entries',
  'tblpayroll_table',
  'tblpayroll_type',
  'tblallowance_type',
  'tblcommission',
  'tblhr_allocation_asset',
  'tblassets',
  'tblassets_group',
  'tblasset_location'
];

// Campos sensíveis que devem ser mascarados
const SENSITIVE_FIELDS = [
  'password',
  'access_token',
  'stripe_id',
  'plaid_account_name',
  'credit_card_number',
  'bank_account',
  'social_security',
  'tax_id'
];

// Esquemas de validação Zod
export const ClientIdSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const TableNameSchema = z.string().refine((table) => ALLOWED_TABLES.includes(table), {
  message: 'Table not allowed'
});

export const LimitSchema = z
  .number()
  .int()
  .min(1)
  .max(parseInt(process.env.MAX_QUERY_ROWS || '1000'));
export const OffsetSchema = z.number().int().min(0).optional();

export const DateRangeSchema = z
  .object({
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  })
  .optional();

export const SearchSchema = z
  .object({
    field: z.string().min(1).max(50),
    value: z.string().min(1).max(100),
    operator: z.enum(['=', 'LIKE', '>', '<', '>=', '<=', 'IN']).default('=')
  })
  .optional();

// Função para sanitizar query SQL
export function sanitizeTableName(tableName: string): string {
  if (!ALLOWED_TABLES.includes(tableName)) {
    throw new Error(`Table '${tableName}' is not allowed`);
  }
  return tableName.replace(/[^a-zA-Z0-9_]/g, '');
}

// Função para mascarar campos sensíveis
export function maskSensitiveData(data: any): any {
  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item));
  }

  if (data && typeof data === 'object') {
    const masked = { ...data };
    for (const field of SENSITIVE_FIELDS) {
      if (masked[field]) {
        masked[field] = '***MASKED***';
      }
    }
    return masked;
  }

  return data;
}

// Função para validar IDs numéricos
export function validateNumericId(id: any, fieldName: string = 'id'): number {
  const parsed = parseInt(id);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: must be a positive integer`);
  }
  return parsed;
}

// Função para construir WHERE clause segura
export function buildWhereClause(
  conditions: Array<{ field: string; value: any; operator?: string }>
): { where: string; params: any[] } {
  if (!conditions.length) {
    return { where: '', params: [] };
  }

  const clauses: string[] = [];
  const params: any[] = [];

  for (const condition of conditions) {
    const { field, value, operator = '=' } = condition;

    // Validar nome do campo (apenas alfanumérico e underscore)
    if (!/^[a-zA-Z0-9_]+$/.test(field)) {
      throw new Error(`Invalid field name: ${field}`);
    }

    if (operator === 'IN' && Array.isArray(value)) {
      const placeholders = value.map(() => '?').join(',');
      clauses.push(`${field} IN (${placeholders})`);
      params.push(...value);
    } else if (operator === 'LIKE') {
      clauses.push(`${field} LIKE ?`);
      params.push(`%${value}%`);
    } else {
      clauses.push(`${field} ${operator} ?`);
      params.push(value);
    }
  }

  return {
    where: 'WHERE ' + clauses.join(' AND '),
    params
  };
}

// Rate limiting simples (em memória)
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 100; // máximo por minuto

export function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const key = clientId;

  const current = requestCounts.get(key);

  if (!current || now > current.resetTime) {
    requestCounts.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  current.count++;
  return true;
}
