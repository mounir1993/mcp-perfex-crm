import { MySQLClient } from '../../mysql-client.js';
import { DatabaseRow } from '../../types/mysql.js';
import { ToolResponse } from '../../types/tools.js';
import { logger } from '../../utils/logger.js';

export interface LeadTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<ToolResponse>;
}

// ====================================================================
// GET LEADS - List all leads with filters
// ====================================================================
const getLeads: LeadTool = {
  name: 'get_leads',
  description: 'List all leads with optional filtering and pagination',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Maximum number of leads to return (default: 100)' },
      offset: { type: 'number', description: 'Number of leads to skip (default: 0)' },
      status: { type: 'string', description: 'Filter by status: customer, lead, lost, junk' },
      source: { type: 'string', description: 'Filter by lead source' },
      assigned: { type: 'number', description: 'Filter by assigned staff ID' },
      search: { type: 'string', description: 'Search in lead name, email or company' },
      date_from: { type: 'string', description: 'Filter leads from date (YYYY-MM-DD)' },
      date_to: { type: 'string', description: 'Filter leads to date (YYYY-MM-DD)' }
    }
  },
  handler: async (args, mysqlClient) => {
    try {
      const {
        limit = 100,
        offset = 0,
        status,
        source,
        assigned,
        search,
        date_from,
        date_to
      } = args;

      const whereConditions = [];
      const queryParams: any[] = [];

      // Status filter
      if (status) {
        switch (status) {
          case 'customer':
            whereConditions.push('l.status = 1');
            break;
          case 'lead':
            whereConditions.push('l.status = 2');
            break;
          case 'lost':
            whereConditions.push('l.status = 3');
            break;
          case 'junk':
            whereConditions.push('l.status = 4');
            break;
        }
      }

      // Source filter
      if (source) {
        whereConditions.push('l.source = ?');
        queryParams.push(source);
      }

      // Assigned filter
      if (assigned) {
        whereConditions.push('l.assigned = ?');
        queryParams.push(assigned);
      }

      // Date filters
      if (date_from) {
        whereConditions.push('DATE(l.dateadded) >= ?');
        queryParams.push(date_from);
      }

      if (date_to) {
        whereConditions.push('DATE(l.dateadded) <= ?');
        queryParams.push(date_to);
      }

      // Search filter
      if (search) {
        whereConditions.push('(l.name LIKE ? OR l.email LIKE ? OR l.company LIKE ?)');
        queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const query = `
        SELECT 
          l.id,
          l.name,
          l.title,
          l.email,
          l.website,
          l.phonenumber,
          l.company,
          l.address,
          l.city,
          l.state,
          l.country,
          l.zip,
          l.status,
          CASE l.status
            WHEN 1 THEN 'Customer'
            WHEN 2 THEN 'Lead'
            WHEN 3 THEN 'Lost'
            WHEN 4 THEN 'Junk'
            ELSE 'Unknown'
          END as status_name,
          l.source,
          ls.name as source_name,
          l.assigned,
          CONCAT(s.firstname, ' ', s.lastname) as assigned_name,
          l.dateadded,
          l.last_contact,
          l.description,
          l.default_language,
          l.client_id,
          c.company as client_company,
          (SELECT COUNT(*) FROM tblleadactivitylog WHERE leadid = l.id) as activity_count
        FROM tblleads l
        LEFT JOIN tblleads_sources ls ON l.source = ls.id
        LEFT JOIN tblstaff s ON l.assigned = s.staffid
        LEFT JOIN tblclients c ON l.client_id = c.userid
        ${whereClause}
        ORDER BY l.dateadded DESC
        LIMIT ? OFFSET ?
      `;

      queryParams.push(limit, offset);

      const leads = await mysqlClient.query<DatabaseRow>(query, queryParams);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM tblleads l
        LEFT JOIN tblleads_sources ls ON l.source = ls.id
        LEFT JOIN tblstaff s ON l.assigned = s.staffid
        LEFT JOIN tblclients c ON l.client_id = c.userid
        ${whereClause}
      `;

      const countParams = queryParams.slice(0, -2); // Remove limit and offset
      const totalResult = await mysqlClient.query<DatabaseRow>(countQuery, countParams);
      const total = totalResult[0]?.total || 0;

      return {
        content: [
          {
            type: 'text',
            text:
              `Found ${leads.length} leads (${total} total)\n\n` +
              leads
                .map(
                  (lead) =>
                    `👤 ${lead.name} - ${lead.company || 'No company'}\n` +
                    `   📧 ${lead.email || 'No email'}\n` +
                    `   📊 Status: ${lead.status_name}\n` +
                    `   📅 Added: ${lead.dateadded}\n` +
                    `   🏷️ Source: ${lead.source_name || 'Unknown'}\n` +
                    `   👥 Assigned: ${lead.assigned_name || 'Unassigned'}\n` +
                    `   📝 Activities: ${lead.activity_count}`
                )
                .join('\n\n')
          }
        ]
      };
    } catch (error) {
      logger.error('Error fetching leads:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching leads: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// ====================================================================
// GET LEAD - Get detailed lead information
// ====================================================================
const getLead: LeadTool = {
  name: 'get_lead',
  description: 'Get detailed information about a specific lead',
  inputSchema: {
    type: 'object',
    properties: {
      lead_id: { type: 'number', description: 'Lead ID', required: true }
    },
    required: ['lead_id']
  },
  handler: async (args, mysqlClient) => {
    try {
      const { lead_id } = args;

      // Get lead details
      const lead = await mysqlClient.queryOne<DatabaseRow>(
        `
        SELECT 
          l.*,
          ls.name as source_name,
          CONCAT(s.firstname, ' ', s.lastname) as assigned_name,
          s.email as assigned_email,
          c.company as client_company,
          c.userid as client_id,
          CASE l.status
            WHEN 1 THEN 'Customer'
            WHEN 2 THEN 'Lead'
            WHEN 3 THEN 'Lost'
            WHEN 4 THEN 'Junk'
            ELSE 'Unknown'
          END as status_name
        FROM tblleads l
        LEFT JOIN tblleads_sources ls ON l.source = ls.id
        LEFT JOIN tblstaff s ON l.assigned = s.staffid
        LEFT JOIN tblclients c ON l.client_id = c.userid
        WHERE l.id = ?
      `,
        [lead_id]
      );

      if (!lead) {
        return {
          content: [
            {
              type: 'text',
              text: `Lead with ID ${lead_id} not found`
            }
          ]
        };
      }

      // Get recent activities
      const activities = await mysqlClient.query<DatabaseRow>(
        `
        SELECT 
          description,
          additional_data,
          date,
          staffid,
          CONCAT(s.firstname, ' ', s.lastname) as staff_name
        FROM tblleadactivitylog la
        LEFT JOIN tblstaff s ON la.staffid = s.staffid
        WHERE la.leadid = ?
        ORDER BY la.date DESC
        LIMIT 10
      `,
        [lead_id]
      );

      let result = `👤 **Lead: ${lead.name}**\n\n`;

      result += `**📋 Basic Information:**\n`;
      result += `• Name: ${lead.name}\n`;
      result += `• Title: ${lead.title || 'Not specified'}\n`;
      result += `• Company: ${lead.company || 'Not specified'}\n`;
      result += `• Email: ${lead.email || 'Not specified'}\n`;
      result += `• Phone: ${lead.phonenumber || 'Not specified'}\n`;
      result += `• Website: ${lead.website || 'Not specified'}\n\n`;

      result += `**📍 Address:**\n`;
      result += `• ${lead.address || 'Not specified'}\n`;
      result += `• ${lead.city || ''} ${lead.state || ''} ${lead.zip || ''}\n`;
      result += `• ${lead.country || 'Not specified'}\n\n`;

      result += `**📊 Lead Status:**\n`;
      result += `• Status: ${lead.status_name}\n`;
      result += `• Source: ${lead.source_name || 'Unknown'}\n`;
      result += `• Assigned to: ${lead.assigned_name || 'Unassigned'}\n`;
      result += `• Date Added: ${lead.dateadded}\n`;
      result += `• Last Contact: ${lead.last_contact || 'Never'}\n\n`;

      if (lead.client_id) {
        result += `**💼 Converted to Client:**\n`;
        result += `• Company: ${lead.client_company}\n`;
        result += `• Client ID: ${lead.client_id}\n\n`;
      }

      if (lead.description) {
        result += `**📝 Description:**\n${lead.description}\n\n`;
      }

      if (activities.length > 0) {
        result += `**📈 Recent Activities (${activities.length}):**\n`;
        activities.forEach((activity) => {
          result += `• ${activity.date}: ${activity.description}\n`;
          if (activity.staff_name) {
            result += `  👤 By: ${activity.staff_name}\n`;
          }
        });
        result += `\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: result
          }
        ]
      };
    } catch (error) {
      logger.error('Error fetching lead:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching lead: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// ====================================================================
// CREATE LEAD - Create a new lead
// ====================================================================
const createLead: LeadTool = {
  name: 'create_lead',
  description: 'Create a new lead in the system',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Lead name', required: true },
      title: { type: 'string', description: 'Job title' },
      email: { type: 'string', description: 'Email address' },
      website: { type: 'string', description: 'Website URL' },
      phonenumber: { type: 'string', description: 'Phone number' },
      company: { type: 'string', description: 'Company name' },
      address: { type: 'string', description: 'Street address' },
      city: { type: 'string', description: 'City' },
      state: { type: 'string', description: 'State/Province' },
      country: { type: 'string', description: 'Country' },
      zip: { type: 'string', description: 'ZIP/Postal code' },
      source: { type: 'number', description: 'Lead source ID' },
      assigned: { type: 'number', description: 'Assigned staff ID' },
      description: { type: 'string', description: 'Lead description/notes' },
      default_language: { type: 'string', description: 'Default language (default: english)' }
    },
    required: ['name']
  },
  handler: async (args, mysqlClient) => {
    try {
      const {
        name,
        title = '',
        email = '',
        website = '',
        phonenumber = '',
        company = '',
        address = '',
        city = '',
        state = '',
        country = '',
        zip = '',
        source = 1,
        assigned = 0,
        description = '',
        default_language = 'english'
      } = args;

      // Check if email already exists
      if (email) {
        const existingLead = await mysqlClient.queryOne<DatabaseRow>(
          'SELECT id FROM tblleads WHERE email = ?',
          [email]
        );

        if (existingLead) {
          return {
            content: [
              {
                type: 'text',
                text: `A lead with email ${email} already exists (ID: ${existingLead.id})`
              }
            ]
          };
        }
      }

      // Verify source exists
      const sourceExists = await mysqlClient.queryOne<DatabaseRow>(
        'SELECT id FROM tblleads_sources WHERE id = ?',
        [source]
      );

      if (!sourceExists) {
        return {
          content: [
            {
              type: 'text',
              text: `Lead source with ID ${source} not found`
            }
          ]
        };
      }

      // Verify assigned staff exists (if provided)
      if (assigned > 0) {
        const staffExists = await mysqlClient.queryOne<DatabaseRow>(
          'SELECT staffid FROM tblstaff WHERE staffid = ?',
          [assigned]
        );

        if (!staffExists) {
          return {
            content: [
              {
                type: 'text',
                text: `Staff member with ID ${assigned} not found`
              }
            ]
          };
        }
      }

      // Create lead
      const leadId = await mysqlClient.executeInsert(
        `
        INSERT INTO tblleads (
          name, title, email, website, phonenumber, company, address, city, state, 
          country, zip, source, assigned, description, default_language, 
          dateadded, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 2)
      `,
        [
          name,
          title,
          email,
          website,
          phonenumber,
          company,
          address,
          city,
          state,
          country,
          zip,
          source,
          assigned,
          description,
          default_language
        ]
      );

      // Log activity
      await mysqlClient.executeInsert(
        `
        INSERT INTO tblleadactivitylog (leadid, description, date, staffid)
        VALUES (?, ?, NOW(), ?)
      `,
        [leadId, `Lead created via MCP`, assigned || 0]
      );

      return {
        content: [
          {
            type: 'text',
            text:
              `✅ Lead created successfully!\n\n` +
              `👤 Lead: ${name} (ID: ${leadId})\n` +
              `🏢 Company: ${company || 'Not specified'}\n` +
              `📧 Email: ${email || 'Not specified'}\n` +
              `📊 Status: Lead\n` +
              `👥 Assigned to: ${assigned ? `Staff ID ${assigned}` : 'Unassigned'}`
          }
        ]
      };
    } catch (error) {
      logger.error('Error creating lead:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error creating lead: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// ====================================================================
// UPDATE LEAD STATUS - Update lead status
// ====================================================================
const updateLeadStatus: LeadTool = {
  name: 'update_lead_status',
  description: 'Update the status of a lead',
  inputSchema: {
    type: 'object',
    properties: {
      lead_id: { type: 'number', description: 'Lead ID', required: true },
      status: {
        type: 'string',
        description: 'New status: customer, lead, lost, junk',
        required: true
      },
      reason: { type: 'string', description: 'Reason for status change' }
    },
    required: ['lead_id', 'status']
  },
  handler: async (args, mysqlClient) => {
    try {
      const { lead_id, status, reason } = args;

      // Map status to number
      let statusNumber;
      switch (status) {
        case 'customer':
          statusNumber = 1;
          break;
        case 'lead':
          statusNumber = 2;
          break;
        case 'lost':
          statusNumber = 3;
          break;
        case 'junk':
          statusNumber = 4;
          break;
        default:
          return {
            content: [
              {
                type: 'text',
                text: `Invalid status: ${status}. Valid options: customer, lead, lost, junk`
              }
            ]
          };
      }

      // Check if lead exists
      const lead = await mysqlClient.queryOne<DatabaseRow>(
        'SELECT id, name, status FROM tblleads WHERE id = ?',
        [lead_id]
      );

      if (!lead) {
        return {
          content: [
            {
              type: 'text',
              text: `Lead with ID ${lead_id} not found`
            }
          ]
        };
      }

      // Update status
      await mysqlClient.query('UPDATE tblleads SET status = ? WHERE id = ?', [
        statusNumber,
        lead_id
      ]);

      // Log activity
      const description = reason
        ? `Status changed to ${status}. Reason: ${reason}`
        : `Status changed to ${status}`;

      await mysqlClient.executeInsert(
        `
        INSERT INTO tblleadactivitylog (leadid, description, date, staffid)
        VALUES (?, ?, NOW(), 0)
      `,
        [lead_id, description]
      );

      const statusNames = {
        1: 'Customer',
        2: 'Lead',
        3: 'Lost',
        4: 'Junk'
      };

      return {
        content: [
          {
            type: 'text',
            text:
              `✅ Lead status updated successfully!\n\n` +
              `👤 Lead: ${lead.name}\n` +
              `📊 Status: ${statusNames[lead.status as keyof typeof statusNames]} → ${statusNames[statusNumber as keyof typeof statusNames]}`
          }
        ]
      };
    } catch (error) {
      logger.error('Error updating lead status:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error updating lead status: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// ====================================================================
// ASSIGN LEAD - Assign lead to staff member
// ====================================================================
const assignLead: LeadTool = {
  name: 'assign_lead',
  description: 'Assign a lead to a staff member',
  inputSchema: {
    type: 'object',
    properties: {
      lead_id: { type: 'number', description: 'Lead ID', required: true },
      staff_id: { type: 'number', description: 'Staff ID to assign to', required: true },
      note: { type: 'string', description: 'Assignment note' }
    },
    required: ['lead_id', 'staff_id']
  },
  handler: async (args, mysqlClient) => {
    try {
      const { lead_id, staff_id, note } = args;

      // Check if lead exists
      const lead = await mysqlClient.queryOne<DatabaseRow>(
        'SELECT id, name, assigned FROM tblleads WHERE id = ?',
        [lead_id]
      );

      if (!lead) {
        return {
          content: [
            {
              type: 'text',
              text: `Lead with ID ${lead_id} not found`
            }
          ]
        };
      }

      // Check if staff exists
      const staff = await mysqlClient.queryOne<DatabaseRow>(
        'SELECT staffid, firstname, lastname FROM tblstaff WHERE staffid = ?',
        [staff_id]
      );

      if (!staff) {
        return {
          content: [
            {
              type: 'text',
              text: `Staff member with ID ${staff_id} not found`
            }
          ]
        };
      }

      // Update assignment
      await mysqlClient.query('UPDATE tblleads SET assigned = ? WHERE id = ?', [staff_id, lead_id]);

      // Log activity
      const description = note
        ? `Lead assigned to ${staff.firstname} ${staff.lastname}. Note: ${note}`
        : `Lead assigned to ${staff.firstname} ${staff.lastname}`;

      await mysqlClient.executeInsert(
        `
        INSERT INTO tblleadactivitylog (leadid, description, date, staffid)
        VALUES (?, ?, NOW(), ?)
      `,
        [lead_id, description, staff_id]
      );

      return {
        content: [
          {
            type: 'text',
            text:
              `✅ Lead assigned successfully!\n\n` +
              `👤 Lead: ${lead.name}\n` +
              `👥 Assigned to: ${staff.firstname} ${staff.lastname}`
          }
        ]
      };
    } catch (error) {
      logger.error('Error assigning lead:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error assigning lead: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// ====================================================================
// ADD LEAD ACTIVITY - Add activity log to lead
// ====================================================================
const addLeadActivity: LeadTool = {
  name: 'add_lead_activity',
  description: 'Add an activity log entry to a lead',
  inputSchema: {
    type: 'object',
    properties: {
      lead_id: { type: 'number', description: 'Lead ID', required: true },
      description: { type: 'string', description: 'Activity description', required: true },
      staff_id: { type: 'number', description: 'Staff ID performing the activity (default: 0)' }
    },
    required: ['lead_id', 'description']
  },
  handler: async (args, mysqlClient) => {
    try {
      const { lead_id, description, staff_id = 0 } = args;

      // Check if lead exists
      const lead = await mysqlClient.queryOne<DatabaseRow>(
        'SELECT id, name FROM tblleads WHERE id = ?',
        [lead_id]
      );

      if (!lead) {
        return {
          content: [
            {
              type: 'text',
              text: `Lead with ID ${lead_id} not found`
            }
          ]
        };
      }

      // Verify staff exists (if provided)
      if (staff_id > 0) {
        const staff = await mysqlClient.queryOne<DatabaseRow>(
          'SELECT staffid FROM tblstaff WHERE staffid = ?',
          [staff_id]
        );

        if (!staff) {
          return {
            content: [
              {
                type: 'text',
                text: `Staff member with ID ${staff_id} not found`
              }
            ]
          };
        }
      }

      // Add activity
      const activityId = await mysqlClient.executeInsert(
        `
        INSERT INTO tblleadactivitylog (leadid, description, date, staffid)
        VALUES (?, ?, NOW(), ?)
      `,
        [lead_id, description, staff_id]
      );

      // Update last contact date
      await mysqlClient.query('UPDATE tblleads SET last_contact = NOW() WHERE id = ?', [lead_id]);

      return {
        content: [
          {
            type: 'text',
            text:
              `✅ Activity added successfully!\n\n` +
              `👤 Lead: ${lead.name}\n` +
              `📝 Activity: ${description}\n` +
              `🆔 Activity ID: ${activityId}`
          }
        ]
      };
    } catch (error) {
      logger.error('Error adding lead activity:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error adding activity: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// ====================================================================
// CONVERT TO CLIENT - Convert lead to client
// ====================================================================
const convertLeadToClient: LeadTool = {
  name: 'convert_lead_to_client',
  description: 'Convert a lead to a client in the system',
  inputSchema: {
    type: 'object',
    properties: {
      lead_id: { type: 'number', description: 'Lead ID', required: true },
      company: { type: 'string', description: 'Company name (override lead company)' },
      vat: { type: 'string', description: 'VAT number' },
      billing_street: { type: 'string', description: 'Billing address' },
      billing_city: { type: 'string', description: 'Billing city' },
      billing_state: { type: 'string', description: 'Billing state' },
      billing_zip: { type: 'string', description: 'Billing ZIP' },
      billing_country: { type: 'string', description: 'Billing country' }
    },
    required: ['lead_id']
  },
  handler: async (args, mysqlClient) => {
    try {
      const {
        lead_id,
        company,
        vat,
        billing_street,
        billing_city,
        billing_state,
        billing_zip,
        billing_country
      } = args;

      // Get lead details
      const lead = await mysqlClient.queryOne<DatabaseRow>('SELECT * FROM tblleads WHERE id = ?', [
        lead_id
      ]);

      if (!lead) {
        return {
          content: [
            {
              type: 'text',
              text: `Lead with ID ${lead_id} not found`
            }
          ]
        };
      }

      if (lead.status === 1) {
        return {
          content: [
            {
              type: 'text',
              text: `Lead ${lead.name} is already converted to a client`
            }
          ]
        };
      }

      // Check if email already exists as client
      if (lead.email) {
        const existingClient = await mysqlClient.queryOne<DatabaseRow>(
          'SELECT userid FROM tblclients WHERE email = ?',
          [lead.email]
        );

        if (existingClient) {
          return {
            content: [
              {
                type: 'text',
                text: `A client with email ${lead.email} already exists (ID: ${existingClient.userid})`
              }
            ]
          };
        }
      }

      // Create client
      const clientId = await mysqlClient.executeInsert(
        `
        INSERT INTO tblclients (
          company, vat, phonenumber, country, city, zip, state, address,
          website, datecreated, leadid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
      `,
        [
          company || lead.company,
          vat || '',
          lead.phonenumber,
          billing_country || lead.country,
          billing_city || lead.city,
          billing_zip || lead.zip,
          billing_state || lead.state,
          billing_street || lead.address,
          lead.website,
          lead_id
        ]
      );

      // Create contact for the client
      await mysqlClient.executeInsert(
        `
        INSERT INTO tblcontacts (
          userid, firstname, lastname, email, title, phonenumber, 
          datecreated, is_primary
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)
      `,
        [
          clientId,
          lead.name.split(' ')[0] || lead.name,
          lead.name.split(' ').slice(1).join(' ') || '',
          lead.email,
          lead.title,
          lead.phonenumber
        ]
      );

      // Update lead status to customer and link to client
      await mysqlClient.query('UPDATE tblleads SET status = 1, client_id = ? WHERE id = ?', [
        clientId,
        lead_id
      ]);

      // Log activity
      await mysqlClient.executeInsert(
        `
        INSERT INTO tblleadactivitylog (leadid, description, date, staffid)
        VALUES (?, ?, NOW(), 0)
      `,
        [lead_id, `Lead converted to client (Client ID: ${clientId})`]
      );

      return {
        content: [
          {
            type: 'text',
            text:
              `✅ Lead converted to client successfully!\n\n` +
              `👤 Lead: ${lead.name}\n` +
              `🏢 Company: ${company || lead.company}\n` +
              `🆔 New Client ID: ${clientId}\n` +
              `📊 Status: Customer`
          }
        ]
      };
    } catch (error) {
      logger.error('Error converting lead to client:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error converting lead: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// ====================================================================
// GET LEAD SOURCES - List all lead sources
// ====================================================================
const getLeadSources: LeadTool = {
  name: 'get_lead_sources',
  description: 'Get all available lead sources',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async (args, mysqlClient) => {
    try {
      const sources = await mysqlClient.query<DatabaseRow>(`
        SELECT 
          id,
          name,
          (SELECT COUNT(*) FROM tblleads WHERE source = tblleads_sources.id) as lead_count
        FROM tblleads_sources
        ORDER BY name ASC
      `);

      if (sources.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No lead sources found'
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text:
              `📋 **Lead Sources (${sources.length}):**\n\n` +
              sources
                .map(
                  (source) =>
                    `🏷️ ${source.name} (ID: ${source.id})\n` + `   📊 ${source.lead_count} leads`
                )
                .join('\n\n')
          }
        ]
      };
    } catch (error) {
      logger.error('Error fetching lead sources:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching lead sources: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// ====================================================================
// LEAD STATISTICS - Get lead statistics
// ====================================================================
const getLeadStatistics: LeadTool = {
  name: 'get_lead_statistics',
  description: 'Get comprehensive lead statistics and metrics',
  inputSchema: {
    type: 'object',
    properties: {
      year: { type: 'number', description: 'Filter by year (default: current year)' },
      month: { type: 'number', description: 'Filter by month (1-12)' },
      assigned: { type: 'number', description: 'Filter by assigned staff member' }
    }
  },
  handler: async (args, mysqlClient) => {
    try {
      const { year = new Date().getFullYear(), month, assigned } = args;

      const whereConditions = [`YEAR(dateadded) = ?`];
      const queryParams = [year];

      if (month) {
        whereConditions.push('MONTH(dateadded) = ?');
        queryParams.push(month);
      }

      if (assigned) {
        whereConditions.push('assigned = ?');
        queryParams.push(assigned);
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Overall statistics
      const stats = await mysqlClient.queryOne<DatabaseRow>(
        `
        SELECT 
          COUNT(*) as total_leads,
          COUNT(CASE WHEN status = 1 THEN 1 END) as converted_count,
          COUNT(CASE WHEN status = 2 THEN 1 END) as active_count,
          COUNT(CASE WHEN status = 3 THEN 1 END) as lost_count,
          COUNT(CASE WHEN status = 4 THEN 1 END) as junk_count,
          ROUND((COUNT(CASE WHEN status = 1 THEN 1 END) / COUNT(*)) * 100, 2) as conversion_rate
        FROM tblleads 
        ${whereClause}
      `,
        queryParams
      );

      // By source
      const bySource = await mysqlClient.query<DatabaseRow>(
        `
        SELECT 
          ls.name as source_name,
          COUNT(l.id) as count,
          COUNT(CASE WHEN l.status = 1 THEN 1 END) as converted
        FROM tblleads l
        LEFT JOIN tblleads_sources ls ON l.source = ls.id
        ${whereClause}
        GROUP BY l.source, ls.name
        ORDER BY count DESC
        LIMIT 5
      `,
        queryParams
      );

      // By assigned staff
      const byStaff = await mysqlClient.query<DatabaseRow>(
        `
        SELECT 
          CONCAT(s.firstname, ' ', s.lastname) as staff_name,
          COUNT(l.id) as count,
          COUNT(CASE WHEN l.status = 1 THEN 1 END) as converted
        FROM tblleads l
        LEFT JOIN tblstaff s ON l.assigned = s.staffid
        ${whereClause} AND l.assigned > 0
        GROUP BY l.assigned, s.firstname, s.lastname
        ORDER BY count DESC
        LIMIT 5
      `,
        queryParams
      );

      let result = `📊 **Lead Statistics ${month ? `for ${year}/${month}` : `for ${year}`}**\n\n`;

      result += `**📈 Overview:**\n`;
      result += `• Total Leads: ${stats?.total_leads || 0}\n`;
      result += `• Conversion Rate: ${stats?.conversion_rate || 0}%\n\n`;

      result += `**📊 By Status:**\n`;
      result += `• 👤 Converted: ${stats?.converted_count || 0}\n`;
      result += `• 🔥 Active: ${stats?.active_count || 0}\n`;
      result += `• ❌ Lost: ${stats?.lost_count || 0}\n`;
      result += `• 🗑️ Junk: ${stats?.junk_count || 0}\n\n`;

      if (bySource.length > 0) {
        result += `**🏷️ Top Sources:**\n`;
        bySource.forEach((source: any, index: number) => {
          const conversionRate =
            source.count > 0 ? ((source.converted / source.count) * 100).toFixed(1) : 0;
          result += `${index + 1}. ${source.source_name}: ${source.count} leads (${conversionRate}% converted)\n`;
        });
        result += `\n`;
      }

      if (byStaff.length > 0) {
        result += `**👥 Top Performers:**\n`;
        byStaff.forEach((staff: any, index: number) => {
          const conversionRate =
            staff.count > 0 ? ((staff.converted / staff.count) * 100).toFixed(1) : 0;
          result += `${index + 1}. ${staff.staff_name}: ${staff.count} leads (${conversionRate}% converted)\n`;
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: result
          }
        ]
      };
    } catch (error) {
      logger.error('Error fetching lead statistics:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching statistics: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// Export all lead tools
export const leadsTools: LeadTool[] = [
  getLeads,
  getLead,
  createLead,
  updateLeadStatus,
  assignLead,
  addLeadActivity,
  convertLeadToClient,
  getLeadSources,
  getLeadStatistics
];
