// Database table types matching Perfex CRM schema

export interface Customer {
  userid: number;
  company: string;
  vat?: string;
  phonenumber?: string;
  country?: number;
  city?: string;
  zip?: string;
  state?: string;
  address?: string;
  website?: string;
  datecreated: Date;
  active: number;
  leadid?: number;
  billing_street?: string;
  billing_city?: string;
  billing_state?: string;
  billing_zip?: string;
  billing_country?: number;
  shipping_street?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_zip?: string;
  shipping_country?: number;
  longitude?: string;
  latitude?: string;
  default_language?: string;
  default_currency?: number;
  show_primary_contact?: number;
  stripe_id?: string;
  registration_confirmed?: number;
  addedfrom?: number;
}

export interface Contact {
  id: number;
  userid: number;
  is_primary: number;
  firstname: string;
  lastname: string;
  email: string;
  phonenumber?: string;
  title?: string;
  datecreated: Date;
  password?: string;
  new_pass_key?: string;
  new_pass_key_requested?: Date;
  email_verified_at?: Date;
  email_verification_key?: string;
  email_verification_sent_at?: Date;
  last_ip?: string;
  last_login?: Date;
  last_password_change?: Date;
  active: number;
  profile_image?: string;
  direction?: string;
  invoice_emails: number;
  estimate_emails: number;
  credit_note_emails: number;
  contract_emails: number;
  task_emails: number;
  project_emails: number;
  ticket_emails: number;
}

export interface Invoice {
  id: number;
  sent: number;
  datesend?: Date;
  clientid: number;
  deleted_customer_name?: string;
  number: number;
  prefix?: string;
  number_format: number;
  datecreated: Date;
  date: Date;
  duedate?: Date;
  currency: number;
  subtotal: number;
  total_tax: number;
  total: number;
  adjustment?: number;
  addedfrom?: number;
  hash: string;
  status: number;
  clientnote?: string;
  adminnote?: string;
  last_overdue_reminder?: Date;
  last_due_reminder?: Date;
  cancel_overdue_reminders: number;
  allowed_payment_modes?: string;
  token?: string;
  discount_percent?: number;
  discount_total?: number;
  discount_type?: string;
  recurring?: number;
  recurring_type?: string;
  custom_recurring: number;
  cycles: number;
  total_cycles: number;
  is_recurring_from?: number;
  last_recurring_date?: Date;
  terms?: string;
  sale_agent?: number;
  billing_street?: string;
  billing_city?: string;
  billing_state?: string;
  billing_zip?: string;
  billing_country?: number;
  shipping_street?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_zip?: string;
  shipping_country?: number;
  include_shipping: number;
  show_shipping_on_invoice: number;
  show_quantity_as: number;
  project_id?: number;
  subscription_id?: number;
  short_link?: string;
}

export interface Estimate {
  id: number;
  sent: number;
  datesend?: Date;
  clientid: number;
  deleted_customer_name?: string;
  project_id?: number;
  number: number;
  prefix?: string;
  number_format: number;
  hash: string;
  datecreated: Date;
  date: Date;
  expirydate?: Date;
  currency: number;
  subtotal: number;
  total_tax: number;
  total: number;
  adjustment?: number;
  addedfrom?: number;
  status: number;
  clientnote?: string;
  adminnote?: string;
  discount_percent?: number;
  discount_total?: number;
  discount_type?: string;
  invoiceid?: number;
  invoiced_date?: Date;
  terms?: string;
  reference_no?: string;
  sale_agent?: number;
  billing_street?: string;
  billing_city?: string;
  billing_state?: string;
  billing_zip?: string;
  billing_country?: number;
  shipping_street?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_zip?: string;
  shipping_country?: number;
  include_shipping: number;
  show_shipping_on_estimate: number;
  show_quantity_as: number;
  pipeline_order?: number;
  is_expiry_notified: number;
  acceptance_firstname?: string;
  acceptance_lastname?: string;
  acceptance_email?: string;
  acceptance_date?: Date;
  acceptance_ip?: string;
  signature?: string;
  short_link?: string;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  status: number;
  clientid: number;
  billing_type: number;
  start_date: Date;
  deadline?: Date;
  project_created: Date;
  date_finished?: Date;
  progress: number;
  progress_from_tasks: number;
  project_cost?: number;
  project_rate_per_hour?: number;
  estimated_hours?: number;
  addedfrom?: number;
  contact_notification?: number;
  notify_contacts?: string;
}

export interface Task {
  id: number;
  name: string;
  description?: string;
  priority?: number;
  dateadded: Date;
  startdate?: Date;
  duedate?: Date;
  datefinished?: Date;
  addedfrom?: number;
  is_added_from_contact: number;
  status: number;
  recurring_type?: string;
  repeat_every?: number;
  recurring: number;
  is_recurring_from?: number;
  cycles: number;
  total_cycles: number;
  custom_recurring: number;
  last_recurring_date?: Date;
  rel_id?: number;
  rel_type?: string;
  is_public: number;
  billable: number;
  billed: number;
  invoice_id?: number;
  hourly_rate?: number;
  milestone?: number;
  kanban_order?: number;
  milestone_order?: number;
  visible_to_client: number;
  deadline_notified: number;
}

export interface Contract {
  id: number;
  content?: string;
  description?: string;
  subject?: string;
  client: number;
  datestart?: Date;
  dateend?: Date;
  contract_type?: number;
  project_id?: number;
  addedfrom?: number;
  dateadded: Date;
  isexpirynotified: number;
  contract_value?: number;
  trash: number;
  not_visible_to_client: number;
  hash?: string;
  signed: number;
  signature?: string;
  marked_as_signed?: number;
  acceptance_firstname?: string;
  acceptance_lastname?: string;
  acceptance_email?: string;
  acceptance_date?: Date;
  acceptance_ip?: string;
  short_link?: string;
}

export interface Lead {
  id: number;
  email?: string;
  name?: string;
  assigned?: number;
  dateadded: Date;
  status?: number;
  source?: number;
  lastcontact?: Date;
  dateassigned?: Date;
  last_status_change?: Date;
  addedfrom?: number;
  is_imported_from_email_integration: number;
  email_integration_uid?: string;
  is_public: number;
  default_language?: string;
  client_id?: number;
  lead_order?: number;
}

export interface Expense {
  id: number;
  category?: number;
  currency: number;
  amount: number;
  tax?: number;
  tax2?: number;
  reference_no?: string;
  note?: string;
  expense_name?: string;
  clientid?: number;
  project_id?: number;
  billable?: number;
  invoiceid?: number;
  paymentmode?: string;
  date: Date;
  recurring_type?: string;
  repeat_every?: number;
  recurring: number;
  cycles: number;
  total_cycles: number;
  custom_recurring: number;
  last_recurring_date?: Date;
  create_invoice_billable?: number;
  send_invoice_to_customer?: number;
  recurring_from?: number;
  dateadded: Date;
  addedfrom?: number;
}

export interface Ticket {
  ticketid: number;
  adminreplying: number;
  userid?: number;
  contactid?: number;
  merged_ticket_id?: number;
  email?: string;
  name?: string;
  department?: number;
  priority?: number;
  status?: number;
  service?: number;
  ticketkey: string;
  subject: string;
  message?: string;
  admin?: number;
  date: Date;
  project_id?: number;
  lastreply?: Date;
  clientread: number;
  adminread: number;
  assigned?: number;
  staff_id_replying?: number;
  cc?: string;
}

// Query result types
export interface QueryResult {
  insertId?: number;
  affectedRows?: number;
  changedRows?: number;
}

// Status enums
export enum InvoiceStatus {
  UNPAID = 1,
  PAID = 2,
  PARTIALLY_PAID = 3,
  OVERDUE = 4,
  CANCELLED = 5,
  DRAFT = 6
}

export enum EstimateStatus {
  DRAFT = 1,
  SENT = 2,
  VIEWED = 3,
  ACCEPTED = 4,
  DECLINED = 5,
  EXPIRED = 6
}

export enum ProjectStatus {
  NOT_STARTED = 1,
  IN_PROGRESS = 2,
  ON_HOLD = 3,
  CANCELLED = 4,
  FINISHED = 5
}

export enum TaskStatus {
  NOT_STARTED = 1,
  IN_PROGRESS = 2,
  TESTING = 3,
  AWAITING_FEEDBACK = 4,
  COMPLETE = 5
}

export enum TicketStatus {
  OPEN = 1,
  IN_PROGRESS = 2,
  ANSWERED = 3,
  ON_HOLD = 4,
  CLOSED = 5
}

export enum TicketPriority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  URGENT = 4
}
