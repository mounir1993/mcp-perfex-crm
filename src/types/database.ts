export interface MySQLConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface ClientConfig {
  id: string;
  name: string;
  database: string;
  features: string[];
}

// Tipos base das principais tabelas do Perfex CRM
export interface Client {
  userid: number;
  company: string;
  vat?: string;
  phonenumber?: string;
  country: number;
  city?: string;
  zip?: string;
  state?: string;
  address?: string;
  website?: string;
  datecreated: string;
  active: number;
  leadid?: number;
  billing_street?: string;
  billing_city?: string;
  billing_state?: string;
  billing_zip?: string;
  billing_country: number;
  shipping_street?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_zip?: string;
  shipping_country: number;
  longitude?: number;
  latitude?: number;
  default_language?: string;
  default_currency: number;
  show_primary_contact: number;
  stripe_id?: string;
  registration_confirmed: number;
  addedfrom: number;
  woo_id?: number;
  store_id?: number;
  is_supplier: number;
  loy_point: number;
}

export interface Invoice {
  id: number;
  sent: number;
  clientid: number;
  number: string;
  prefix?: string;
  datecreated: string;
  date: string;
  duedate: string;
  currency: number;
  subtotal: number;
  total_tax: number;
  total: number;
  status: number;
  project_id?: number;
  subscription_id: number;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  status: number;
  clientid: number;
  billing_type: number;
  start_date: string;
  deadline?: string;
  project_created: string;
  date_finished?: string;
  progress: number;
  progress_from_tasks: number;
  project_cost?: number;
  project_rate_per_hour: number;
  estimated_hours?: number;
  addedfrom: number;
  contact_notification: number;
}

export interface Staff {
  staffid: number;
  email: string;
  firstname: string;
  lastname: string;
  phonenumber?: string;
  password: string;
  datecreated: string;
  profile_image?: string;
  last_ip?: string;
  last_login?: string;
  last_activity?: string;
  admin: number;
  role: number;
  active: number;
  hourly_rate: number;
  job_position?: number;
}

export interface Account {
  id: number;
  name?: string;
  key_name: string;
  number?: string;
  parent_account?: number;
  account_type_id: number;
  account_detail_type_id: number;
  balance?: number;
  balance_as_of?: string;
  description?: string;
  default_account: number;
  active: number;
  access_token?: string;
  account_id?: string;
  plaid_status: number;
  plaid_account_name?: string;
}

export interface AccountHistory {
  id: number;
  account: number;
  debit: number;
  credit: number;
  description?: string;
  rel_id?: number;
  rel_type?: string;
  datecreated: string;
  addedfrom: number;
  customer?: number;
  reconcile: number;
  split: number;
  item: number;
  paid: number;
  date: string;
  tax: number;
  payslip_type?: string;
  vendor?: number;
  itemable_id?: number;
  cleared: number;
}

// Tipos para analytics e relatórios
export interface DashboardMetrics {
  total_clients: number;
  revenue_mtd: number;
  active_projects: number;
  total_staff: number;
  overdue_amount: number;
}

export interface ClientProfitability {
  userid: number;
  company: string;
  total_revenue: number;
  total_cost: number;
  profit: number;
  margin_percent: number;
  invoice_count: number;
  avg_invoice_value: number;
}

export interface ProjectMetrics {
  id: number;
  name: string;
  client_company: string;
  total_hours: number;
  total_cost: number;
  total_revenue: number;
  profit: number;
  margin_percent: number;
  completion_percent: number;
  days_remaining: number;
}

export interface CashFlowProjection {
  month: string;
  pending_invoices: number;
  paid_invoices: number;
  total_invoices: number;
  projected_revenue: number;
}

export interface StaffPerformance {
  staffid: number;
  name: string;
  total_hours: number;
  billable_hours: number;
  utilization_rate: number;
  revenue_generated: number;
  projects_count: number;
  avg_hourly_rate: number;
}
