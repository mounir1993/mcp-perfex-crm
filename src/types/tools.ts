import { MySQLClient } from '../mysql-client.js';

// Base types for all tools
export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  [key: string]: unknown; // Index signature for MCP SDK compatibility
}

export interface BaseTool<TArgs = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (args: TArgs, mysqlClient: MySQLClient) => Promise<ToolResponse>;
}

// Common argument types
export interface PaginationArgs {
  limit?: number;
  offset?: number;
}

export interface DateRangeArgs {
  date_from?: string;
  date_to?: string;
}

export interface ClientFilterArgs {
  client_id?: number;
}

// Contracts specific types
export interface GetContractsArgs extends PaginationArgs, DateRangeArgs, ClientFilterArgs {
  contract_type?: string;
  signed_only?: boolean;
  expired_only?: boolean;
  active_only?: boolean;
}

export interface GetContractArgs {
  contract_id: number;
}

export interface CreateContractArgs {
  subject: string;
  client_id: number;
  datestart: string;
  dateend: string;
  contract_type: string;
  contract_value?: number;
  description?: string;
  terms?: string;
}

export interface UpdateContractArgs {
  contract_id: number;
  subject?: string;
  datestart?: string;
  dateend?: string;
  contract_value?: number;
  signed?: boolean;
  description?: string;
  terms?: string;
}

export interface RenewContractArgs {
  contract_id: number;
  new_datestart: string;
  new_dateend: string;
  keep_terms?: boolean;
}

export interface ContractAnalyticsArgs {
  period?: 'month' | 'quarter' | 'year' | 'all';
  client_id?: number;
}

// Projects specific types
export interface GetProjectsArgs extends PaginationArgs, DateRangeArgs, ClientFilterArgs {
  status?: number;
  name?: string;
}

export interface GetProjectArgs {
  project_id: number;
}

export interface CreateProjectArgs {
  name: string;
  client_id: number;
  start_date?: string;
  deadline?: string;
  status?: number;
  description?: string;
  billing_type?: string;
  project_cost?: number;
  project_rate_per_hour?: number;
}

export interface UpdateProjectArgs {
  project_id: number;
  name?: string;
  status?: number;
  progress?: number;
  deadline?: string;
  description?: string;
}

// Tasks specific types
export interface GetTasksArgs extends PaginationArgs {
  project_id?: number;
  status?: number;
  assignee?: number;
  priority?: number;
  overdue_only?: boolean;
}

export interface GetTaskArgs {
  task_id: number;
}

export interface CreateTaskArgs {
  name: string;
  project_id?: number;
  description?: string;
  status?: number;
  priority?: number;
  duedate?: string;
  assignees?: number[];
  tags?: string[];
}

export interface UpdateTaskArgs {
  task_id: number;
  name?: string;
  description?: string;
  status?: number;
  priority?: number;
  duedate?: string;
  tags?: string[];
}

// Customers specific types
export interface GetCustomersArgs extends PaginationArgs {
  active?: boolean;
  search?: string;
  country?: number;
  created_from?: string;
  created_to?: string;
}

export interface GetCustomerArgs {
  client_id: number;
}

export interface CreateCustomerArgs {
  company: string;
  vat?: string;
  phonenumber?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: number;
  active?: boolean;
}

export interface UpdateCustomerArgs extends ClientFilterArgs {
  company?: string;
  vat?: string;
  phonenumber?: string;
  country?: number;
  city?: string;
  zip?: string;
  state?: string;
  address?: string;
  website?: string;
  active?: boolean;
}

export interface SearchCustomersArgs {
  query: string;
  fields?: string[];
  limit?: number;
}

export interface CustomerAnalyticsArgs extends ClientFilterArgs {
  period?: 'month' | 'quarter' | 'year' | 'all';
}

export interface DeleteCustomerArgs extends ClientFilterArgs {
  hard_delete?: boolean;
}

export interface ManageCustomerContactsArgs extends ClientFilterArgs {
  action: 'list' | 'add' | 'update' | 'delete';
  contact_id?: number;
  firstname?: string;
  lastname?: string;
  email?: string;
  phonenumber?: string;
  title?: string;
  is_primary?: boolean;
  active?: boolean;
  password?: string;
  send_welcome_email?: boolean;
}

// Helper type to ensure type safety
export type ToolHandler<TArgs> = (args: TArgs, mysqlClient: MySQLClient) => Promise<ToolResponse>;
