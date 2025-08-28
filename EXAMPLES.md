# MCP Perfex CRM - Practical Examples

**Version**: 1.0.0  
**Last Updated**: August 2025  
**Examples**: 25+ real-world scenarios

---

## 📋 Table of Contents

1. [Basic Usage](#-basic-usage)
2. [Customer Management](#-customer-management)
3. [Invoice & Payment Processing](#-invoice--payment-processing)
4. [Lead Management & Conversion](#-lead-management--conversion)
5. [Project & Task Management](#-project--task-management)
6. [Support & Ticketing](#-support--ticketing)
7. [Business Analytics](#-business-analytics)
8. [Batch Operations](#-batch-operations)
9. [N8N Integration Examples](#-n8n-integration-examples)
10. [Error Handling](#-error-handling)

---

## 🚀 Basic Usage

### Getting Started
First, ensure your MCP Perfex CRM server is properly configured and running:

```typescript
// Test connection
const healthCheck = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "get_customers",
  arguments: { limit: 1 }
});

if (healthCheck.content[0].text.includes("Error")) {
  console.log("❌ Connection failed:", healthCheck.content[0].text);
} else {
  console.log("✅ MCP Perfex CRM is connected and working!");
}
```

---

## 👥 Customer Management

### Example 1: Complete Customer Onboarding

```typescript
async function onboardNewCustomer() {
  try {
    // 1. Create the customer
    const customerResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "create_customer",
      arguments: {
        company: "Digital Innovations Ltd",
        vat: "GB123456789",
        address: "456 Innovation Street",
        city: "Manchester",
        state: "Greater Manchester",
        zip: "M1 1AA",
        country: "United Kingdom",
        website: "https://digitalinnovations.com",
        phonenumber: "+44 161 123 4567"
      }
    });

    const customer = JSON.parse(customerResult.content[0].text);
    console.log(`✅ Customer created with ID: ${customer.client_id}`);

    // 2. Get customer details to verify
    const customerDetails = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "get_customer",
      arguments: {
        client_id: customer.client_id
      }
    });

    const details = JSON.parse(customerDetails.content[0].text);
    console.log(`📋 Customer: ${details.customer.company}`);
    console.log(`📍 Location: ${details.customer.city}, ${details.customer.country}`);

    return customer.client_id;

  } catch (error) {
    console.error("❌ Customer onboarding failed:", error);
    throw error;
  }
}
```

### Example 2: Customer Search and Analytics

```typescript
async function findAndAnalyzeCustomers() {
  // 1. Search for tech companies
  const searchResult = await use_mcp_tool({
    server_name: "mcp-perfex-crm",
    tool_name: "search_customers",
    arguments: {
      query: "tech",
      fields: ["company", "vat", "city"],
      limit: 10
    }
  });

  const searchData = JSON.parse(searchResult.content[0].text);
  console.log(`🔍 Found ${searchData.count} tech companies`);

  // 2. Get analytics for each customer
  for (const customer of searchData.results) {
    const analytics = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "customer_analytics",
      arguments: {
        client_id: customer.userid,
        period: "year"
      }
    });

    const analyticsData = JSON.parse(analytics.content[0].text);
    
    console.log(`\n📊 ${customer.company} Analytics:`);
    console.log(`   💰 Total Revenue: €${analyticsData.analytics.total_revenue}`);
    console.log(`   📄 Total Invoices: ${analyticsData.analytics.total_invoices}`);
    console.log(`   📈 Payment Ratio: ${(analyticsData.analytics.payment_ratio * 100).toFixed(1)}%`);
  }
}
```

### Example 3: Bulk Customer Export

```typescript
async function exportCustomerData() {
  // Export active customers to JSON
  const exportResult = await use_mcp_tool({
    server_name: "mcp-perfex-crm",
    tool_name: "export_customers",
    arguments: {
      format: "json",
      filters: {
        active: true,
        limit: 1000
      }
    }
  });

  const exportData = JSON.parse(exportResult.content[0].text);
  
  console.log(`📤 Exported ${exportData.total_records} customers`);
  console.log(`📅 Export completed at: ${exportData.exported_at}`);

  // Save to file or process data
  const customers = exportData.export_data;
  
  // Example: Find customers without VAT numbers
  const noVAT = customers.filter(c => !c.vat || c.vat.trim() === '');
  console.log(`⚠️ ${noVAT.length} customers without VAT numbers`);

  return exportData;
}
```

---

## 💰 Invoice & Payment Processing

### Example 4: Complete Invoice Lifecycle

```typescript
async function processInvoiceLifecycle(clientId: number) {
  try {
    // 1. Create invoice with multiple items
    const invoiceResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "create_invoice",
      arguments: {
        client_id: clientId,
        date: new Date().toISOString().split('T')[0],
        duedate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days
        currency: "EUR",
        terms: "Payment due within 30 days. Late payments incur 2% monthly interest.",
        clientnote: "Thank you for your business!",
        items: [
          {
            description: "Website Development",
            long_description: "Custom responsive website with CMS",
            qty: 1,
            rate: 5000.00,
            unit: "project"
          },
          {
            description: "SEO Optimization",
            long_description: "6-month SEO optimization package",
            qty: 6,
            rate: 500.00,
            unit: "month"
          },
          {
            description: "Hosting Setup",
            long_description: "Premium hosting setup and configuration",
            qty: 1,
            rate: 200.00,
            unit: "service"
          }
        ]
      }
    });

    const invoice = JSON.parse(invoiceResult.content[0].text);
    console.log(`📄 Invoice created: ${invoice.invoice_number} (€${invoice.total})`);
    
    // 2. Send invoice to client
    const sendResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "send_invoice",
      arguments: {
        invoice_id: invoice.invoice_id
      }
    });

    console.log(`📧 Invoice sent to client`);

    // 3. Record partial payment
    const paymentResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "add_invoice_payment",
      arguments: {
        invoice_id: invoice.invoice_id,
        amount: 4000.00,
        paymentdate: new Date().toISOString().split('T')[0],
        paymentmode: "bank_transfer",
        transactionid: `TXN-${Date.now()}`,
        note: "Initial payment - 50% deposit"
      }
    });

    const payment = JSON.parse(paymentResult.content[0].text);
    console.log(`💳 Payment recorded: €${payment.amount} (${payment.new_status})`);

    // 4. Get updated invoice details
    const updatedInvoice = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "get_invoice",
      arguments: {
        invoice_id: invoice.invoice_id
      }
    });

    const invoiceDetails = JSON.parse(updatedInvoice.content[0].text);
    console.log(`💰 Remaining balance: €${invoiceDetails.invoice.balance}`);

    return invoice.invoice_id;

  } catch (error) {
    console.error("❌ Invoice processing failed:", error);
    throw error;
  }
}
```

### Example 5: Invoice Analytics Dashboard

```typescript
async function generateInvoiceDashboard() {
  // Get comprehensive invoice statistics
  const statsResult = await use_mcp_tool({
    server_name: "mcp-perfex-crm",
    tool_name: "get_invoice_statistics",
    arguments: {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1
    }
  });

  const stats = JSON.parse(statsResult.content[0].text);
  
  console.log("📊 INVOICE DASHBOARD - " + new Date().toLocaleDateString());
  console.log("=" + "=".repeat(50));
  
  console.log(`\n💰 FINANCIAL OVERVIEW:`);
  console.log(`   Total Invoices: ${stats.overview.total_invoices}`);
  console.log(`   Total Value: €${stats.overview.total_value.toLocaleString()}`);
  console.log(`   Average Value: €${stats.overview.average_value.toFixed(2)}`);
  
  console.log(`\n📈 PAYMENT STATUS:`);
  console.log(`   ✅ Paid: ${stats.by_status.paid.count} (€${stats.by_status.paid.value.toLocaleString()})`);
  console.log(`   ⏳ Unpaid: ${stats.by_status.unpaid.count} (€${stats.by_status.unpaid.value.toLocaleString()})`);
  console.log(`   ⚠️ Overdue: ${stats.by_status.overdue.count} (€${stats.by_status.overdue.value.toLocaleString()})`);

  if (stats.top_clients?.length > 0) {
    console.log(`\n🏆 TOP CLIENTS:`);
    stats.top_clients.slice(0, 5).forEach((client, index) => {
      console.log(`   ${index + 1}. ${client.company}: ${client.invoice_count} invoices (€${client.total_value.toLocaleString()})`);
    });
  }

  // Calculate key metrics
  const paidPercentage = (stats.by_status.paid.value / stats.overview.total_value * 100).toFixed(1);
  const overduePercentage = (stats.by_status.overdue.value / stats.overview.total_value * 100).toFixed(1);
  
  console.log(`\n📋 KEY METRICS:`);
  console.log(`   Payment Rate: ${paidPercentage}%`);
  console.log(`   Overdue Rate: ${overduePercentage}%`);
  console.log(`   Cash Flow Health: ${paidPercentage > 80 ? "🟢 Excellent" : paidPercentage > 60 ? "🟡 Good" : "🔴 Needs Attention"}`);

  return stats;
}
```

---

## 🎯 Lead Management & Conversion

### Example 6: Lead Nurturing Workflow

```typescript
async function nurtureLead(leadData: any) {
  try {
    // 1. Create lead
    const leadResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "create_lead",
      arguments: {
        name: leadData.name,
        company: leadData.company,
        title: leadData.title,
        email: leadData.email,
        phone: leadData.phone,
        value: leadData.estimatedValue,
        source: leadData.source,
        description: leadData.description
      }
    });

    const lead = JSON.parse(leadResult.content[0].text);
    console.log(`🎯 Lead created: ${lead.lead.name} from ${lead.lead.company}`);

    // 2. Assign to sales team
    const assignResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "assign_lead",
      arguments: {
        lead_id: lead.lead_id,
        staff_id: 3 // Assign to specific sales person
      }
    });

    console.log(`👤 Lead assigned to sales team`);

    // 3. Log initial contact activity
    const activityResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "add_lead_activity",
      arguments: {
        lead_id: lead.lead_id,
        description: "Initial contact established via " + leadData.source,
        type: "contact_made"
      }
    });

    // 4. Schedule follow-up
    const followUpActivity = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "add_lead_activity",
      arguments: {
        lead_id: lead.lead_id,
        description: "Discovery call scheduled for next week",
        type: "call_scheduled"
      }
    });

    console.log(`📅 Follow-up activities logged`);

    return lead.lead_id;

  } catch (error) {
    console.error("❌ Lead nurturing failed:", error);
    throw error;
  }
}

// Usage example
async function processWebsiteInquiry() {
  const leadData = {
    name: "Sarah Johnson",
    company: "Future Tech Solutions",
    title: "CTO",
    email: "sarah@futuretech.com",
    phone: "+44 20 9876 5432",
    estimatedValue: 25000.00,
    source: "Website Contact Form",
    description: "Interested in digital transformation consulting services. Company has 50+ employees and looking for comprehensive solution."
  };

  const leadId = await nurtureLead(leadData);
  console.log(`✅ Website inquiry processed. Lead ID: ${leadId}`);
}
```

### Example 7: Lead Conversion Process

```typescript
async function convertQualifiedLead(leadId: number) {
  try {
    // 1. Get lead details
    const leadDetails = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "get_lead",
      arguments: {
        lead_id: leadId
      }
    });

    const lead = JSON.parse(leadDetails.content[0].text);
    console.log(`🔍 Processing lead: ${lead.lead.name} (${lead.lead.company})`);

    // 2. Log qualification activity
    const qualificationActivity = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "add_lead_activity",
      arguments: {
        lead_id: leadId,
        description: "Lead qualified after discovery call. Budget confirmed, decision maker identified, timeline established.",
        type: "qualified"
      }
    });

    // 3. Convert to customer
    const conversionResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "convert_lead_to_client",
      arguments: {
        lead_id: leadId,
        client_data: {
          company: lead.lead.company,
          billing_street: "123 Business Park",
          billing_city: "London",
          billing_state: "England",
          billing_zip: "SW1A 1AA",
          billing_country: "United Kingdom"
        }
      }
    });

    const conversion = JSON.parse(conversionResult.content[0].text);
    console.log(`🎉 Lead converted to customer! Customer ID: ${conversion.customer_id}`);

    // 4. Create initial project proposal
    const projectResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "create_project",
      arguments: {
        name: `Digital Transformation - ${lead.lead.company}`,
        client_id: conversion.customer_id,
        start_date: new Date().toISOString().split('T')[0],
        deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 90 days
        project_cost: lead.lead.value,
        billing_type: "fixed_rate",
        description: "Comprehensive digital transformation project based on discovery requirements"
      }
    });

    const project = JSON.parse(projectResult.content[0].text);
    console.log(`📋 Project created: ${project.project.name}`);

    return {
      customerId: conversion.customer_id,
      projectId: project.project_id
    };

  } catch (error) {
    console.error("❌ Lead conversion failed:", error);
    throw error;
  }
}
```

### Example 8: Lead Performance Analytics

```typescript
async function analyzeLead Performance() {
  // Get lead statistics
  const leadStats = await use_mcp_tool({
    server_name: "mcp-perfex-crm",
    tool_name: "get_lead_statistics",
    arguments: {
      period: "quarter"
    }
  });

  const stats = JSON.parse(leadStats.content[0].text);
  
  console.log("🎯 LEAD PERFORMANCE REPORT");
  console.log("=" + "=".repeat(40));
  
  console.log(`\n📊 OVERVIEW (This Quarter):`);
  console.log(`   Total Leads: ${stats.overview.total_leads}`);
  console.log(`   New Leads: ${stats.overview.new_leads}`);
  console.log(`   Converted: ${stats.overview.converted_leads}`);
  console.log(`   Conversion Rate: ${stats.overview.conversion_rate.toFixed(1)}%`);
  console.log(`   Total Value: €${stats.overview.total_value.toLocaleString()}`);
  console.log(`   Converted Value: €${stats.overview.converted_value.toLocaleString()}`);

  if (stats.by_source?.length > 0) {
    console.log(`\n📍 PERFORMANCE BY SOURCE:`);
    stats.by_source.forEach(source => {
      console.log(`   ${source.source}: ${source.count} leads, ${source.converted} converted (${source.conversion_rate.toFixed(1)}%)`);
    });
  }

  if (stats.by_staff?.length > 0) {
    console.log(`\n👥 PERFORMANCE BY STAFF:`);
    stats.by_staff.forEach(staff => {
      console.log(`   ${staff.staff_name}: ${staff.leads} leads, ${staff.converted} converted (${staff.conversion_rate.toFixed(1)}%)`);
    });
  }

  // Calculate insights
  const bestSource = stats.by_source?.reduce((prev, current) => 
    prev.conversion_rate > current.conversion_rate ? prev : current
  );
  
  const topPerformer = stats.by_staff?.reduce((prev, current) => 
    prev.conversion_rate > current.conversion_rate ? prev : current
  );

  console.log(`\n💡 INSIGHTS:`);
  if (bestSource) {
    console.log(`   🏆 Best performing source: ${bestSource.source} (${bestSource.conversion_rate.toFixed(1)}%)`);
  }
  if (topPerformer) {
    console.log(`   🌟 Top performer: ${topPerformer.staff_name} (${topPerformer.conversion_rate.toFixed(1)}%)`);
  }
  
  return stats;
}
```

---

## 📊 Project & Task Management

### Example 9: Complete Project Setup

```typescript
async function setupCompleteProject(customerId: number) {
  try {
    // 1. Create main project
    const projectResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "create_project",
      arguments: {
        name: "E-commerce Platform Development",
        client_id: customerId,
        start_date: new Date().toISOString().split('T')[0],
        deadline: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 4 months
        project_cost: 45000.00,
        billing_type: "fixed_rate",
        description: "Custom e-commerce platform with inventory management, payment processing, and analytics dashboard"
      }
    });

    const project = JSON.parse(projectResult.content[0].text);
    console.log(`📋 Project created: ${project.project.name} (ID: ${project.project_id})`);

    // 2. Create project phases as tasks
    const phases = [
      {
        name: "Discovery & Planning Phase",
        description: "Requirements gathering, technical specification, project planning",
        priority: "high",
        start_date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 2 weeks
      },
      {
        name: "UI/UX Design Phase",
        description: "User interface design, user experience optimization, design system creation",
        priority: "high",
        start_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        due_date: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 3 weeks
      },
      {
        name: "Backend Development",
        description: "Database design, API development, payment integration, security implementation",
        priority: "high",
        start_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        due_date: new Date(Date.now() + 77 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 8 weeks
      },
      {
        name: "Frontend Development",
        description: "React.js frontend, responsive design implementation, component library",
        priority: "medium",
        start_date: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        due_date: new Date(Date.now() + 91 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 8 weeks
      },
      {
        name: "Testing & Quality Assurance",
        description: "Unit testing, integration testing, user acceptance testing, performance optimization",
        priority: "high",
        start_date: new Date(Date.now() + 77 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        due_date: new Date(Date.now() + 105 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 4 weeks
      },
      {
        name: "Deployment & Go-Live",
        description: "Production deployment, DNS configuration, SSL setup, monitoring implementation",
        priority: "high",
        start_date: new Date(Date.now() + 105 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        due_date: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 2 weeks
      }
    ];

    const taskIds = [];
    
    for (const phase of phases) {
      const taskResult = await use_mcp_tool({
        server_name: "mcp-perfex-crm",
        tool_name: "create_task",
        arguments: {
          name: phase.name,
          description: phase.description,
          project_id: project.project_id,
          priority: phase.priority,
          startdate: phase.start_date,
          duedate: phase.due_date,
          assigned: [1, 2] // Assign to team members
        }
      });

      const task = JSON.parse(taskResult.content[0].text);
      taskIds.push(task.task_id);
      console.log(`✅ Task created: ${phase.name}`);
    }

    console.log(`🎯 Project setup complete with ${phases.length} phases`);
    
    return {
      projectId: project.project_id,
      taskIds: taskIds
    };

  } catch (error) {
    console.error("❌ Project setup failed:", error);
    throw error;
  }
}
```

---

## 🎫 Support & Ticketing

### Example 10: Support Ticket Workflow

```typescript
async function handleSupportRequest(ticketData: any) {
  try {
    // 1. Create support ticket
    const ticketResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "create_ticket",
      arguments: {
        subject: ticketData.subject,
        message: ticketData.message,
        client_id: ticketData.clientId,
        priority: ticketData.priority || "medium",
        department: ticketData.department || "technical_support",
        service: ticketData.service
      }
    });

    const ticket = JSON.parse(ticketResult.content[0].text);
    console.log(`🎫 Support ticket created: #${ticket.ticket.ticketid}`);

    // 2. Add initial response
    const responseResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "add_ticket_reply",
      arguments: {
        ticket_id: ticket.ticket_id,
        message: "Thank you for contacting support. We have received your request and a team member will respond within 2 hours during business hours.",
        staff_id: 1
      }
    });

    // 3. Update ticket status
    const statusResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "update_ticket_status",
      arguments: {
        ticket_id: ticket.ticket_id,
        status: "in_progress"
      }
    });

    console.log(`✅ Ticket processed and team notified`);
    
    return ticket.ticket_id;

  } catch (error) {
    console.error("❌ Support ticket processing failed:", error);
    throw error;
  }
}

// Usage example
async function processUrgentIssue() {
  const urgentTicket = {
    subject: "E-commerce site down - urgent assistance needed",
    message: "Our e-commerce website is currently down and customers cannot place orders. This is affecting our revenue significantly. Please provide immediate assistance.",
    clientId: 123,
    priority: "high",
    department: "technical_support",
    service: "emergency_support"
  };

  const ticketId = await handleSupportRequest(urgentTicket);
  
  // Escalate to high priority
  await use_mcp_tool({
    server_name: "mcp-perfex-crm",
    tool_name: "update_ticket_priority",
    arguments: {
      ticket_id: ticketId,
      priority: "urgent"
    }
  });

  console.log(`🚨 Urgent ticket #${ticketId} escalated to urgent priority`);
}
```

---

## 📈 Business Analytics

### Example 11: Comprehensive Business Dashboard

```typescript
async function generateBusinessDashboard() {
  console.log("📊 GENERATING BUSINESS DASHBOARD");
  console.log("=" + "=".repeat(50));
  
  try {
    // 1. Get customer overview
    const customerResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "get_customers",
      arguments: { limit: 1000 }
    });
    const customers = JSON.parse(customerResult.content[0].text);
    
    // 2. Get invoice statistics
    const invoiceStats = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "get_invoice_statistics",
      arguments: { year: new Date().getFullYear() }
    });
    const invoices = JSON.parse(invoiceStats.content[0].text);
    
    // 3. Get lead statistics
    const leadStats = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "get_lead_statistics",
      arguments: { period: "month" }
    });
    const leads = JSON.parse(leadStats.content[0].text);
    
    // 4. Get project overview
    const projectResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "get_projects",
      arguments: { limit: 1000 }
    });
    const projects = JSON.parse(projectResult.content[0].text);

    // Display comprehensive dashboard
    console.log(`\n👥 CUSTOMER METRICS:`);
    console.log(`   Total Customers: ${customers.pagination.total}`);
    console.log(`   Active Customers: ${customers.customers.filter(c => c.active === 1).length}`);
    
    console.log(`\n💰 FINANCIAL METRICS (${new Date().getFullYear()}):`);
    console.log(`   Total Revenue: €${invoices.overview.total_value.toLocaleString()}`);
    console.log(`   Paid Revenue: €${invoices.overview.paid_value.toLocaleString()}`);
    console.log(`   Outstanding: €${invoices.overview.unpaid_value.toLocaleString()}`);
    console.log(`   Average Invoice: €${invoices.overview.average_value.toFixed(2)}`);
    
    const paymentRate = (invoices.overview.paid_value / invoices.overview.total_value * 100).toFixed(1);
    console.log(`   Payment Rate: ${paymentRate}%`);
    
    console.log(`\n🎯 LEAD METRICS (This Month):`);
    console.log(`   New Leads: ${leads.overview.new_leads}`);
    console.log(`   Converted: ${leads.overview.converted_leads}`);
    console.log(`   Conversion Rate: ${leads.overview.conversion_rate.toFixed(1)}%`);
    console.log(`   Lead Value: €${leads.overview.total_value.toLocaleString()}`);
    
    console.log(`\n📋 PROJECT METRICS:`);
    const activeProjects = projects.projects.filter(p => p.status === 2).length;
    const completedProjects = projects.projects.filter(p => p.status === 4).length;
    console.log(`   Total Projects: ${projects.pagination.total}`);
    console.log(`   Active Projects: ${activeProjects}`);
    console.log(`   Completed Projects: ${completedProjects}`);
    
    // Calculate business health score
    const healthMetrics = {
      paymentRate: parseFloat(paymentRate),
      conversionRate: leads.overview.conversion_rate,
      customerGrowth: customers.pagination.total, // Simplified
      projectCompletion: completedProjects / projects.pagination.total * 100
    };
    
    const healthScore = (
      healthMetrics.paymentRate * 0.3 +
      healthMetrics.conversionRate * 0.3 +
      Math.min(healthMetrics.customerGrowth, 100) * 0.2 +
      healthMetrics.projectCompletion * 0.2
    ).toFixed(0);
    
    console.log(`\n🏥 BUSINESS HEALTH SCORE: ${healthScore}/100`);
    
    if (healthScore >= 80) {
      console.log(`   Status: 🟢 Excellent - Business is performing very well`);
    } else if (healthScore >= 60) {
      console.log(`   Status: 🟡 Good - Some areas for improvement`);
    } else {
      console.log(`   Status: 🔴 Needs Attention - Focus on key metrics`);
    }

    return {
      customers: customers.pagination.total,
      revenue: invoices.overview.total_value,
      leads: leads.overview.new_leads,
      projects: projects.pagination.total,
      healthScore: parseInt(healthScore)
    };

  } catch (error) {
    console.error("❌ Dashboard generation failed:", error);
    throw error;
  }
}
```

---

## 🔄 Batch Operations

### Example 12: Bulk Data Processing

```typescript
async function processBulkOperations() {
  console.log("🔄 STARTING BULK OPERATIONS");
  
  try {
    // 1. Get all unpaid invoices
    const unpaidResult = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "get_invoices",
      arguments: {
        status: "unpaid",
        limit: 500
      }
    });
    
    const unpaidInvoices = JSON.parse(unpaidResult.content[0].text);
    console.log(`📄 Found ${unpaidInvoices.invoices.length} unpaid invoices`);
    
    // 2. Process overdue invoices (example: send reminders)
    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 30); // 30 days ago
    
    const overdueInvoices = unpaidInvoices.invoices.filter(inv => 
      new Date(inv.duedate) < overdueDate
    );
    
    console.log(`⚠️ Found ${overdueInvoices.length} overdue invoices`);
    
    // 3. Update overdue invoices status
    for (const invoice of overdueInvoices.slice(0, 10)) { // Process first 10
      try {
        await use_mcp_tool({
          server_name: "mcp-perfex-crm",
          tool_name: "update_invoice_status",
          arguments: {
            invoice_id: invoice.id,
            status: "overdue"
          }
        });
        
        console.log(`✅ Updated invoice ${invoice.number} to overdue`);
      } catch (error) {
        console.error(`❌ Failed to update invoice ${invoice.number}:`, error);
      }
    }
    
    // 4. Get customer analytics for top clients
    const topClients = await use_mcp_tool({
      server_name: "mcp-perfex-crm",
      tool_name: "get_customers",
      arguments: {
        limit: 5,
        active: true
      }
    });
    
    const clients = JSON.parse(topClients.content[0].text);
    
    console.log(`\n📊 PROCESSING TOP ${clients.customers.length} CLIENTS:`);
    
    for (const client of clients.customers) {
      try {
        const analytics = await use_mcp_tool({
          server_name: "mcp-perfex-crm",
          tool_name: "customer_analytics",
          arguments: {
            client_id: client.userid,
            period: "year"
          }
        });
        
        const data = JSON.parse(analytics.content[0].text);
        console.log(`   ${client.company}: €${data.analytics.total_revenue} revenue, ${data.analytics.total_invoices} invoices`);
        
      } catch (error) {
        console.error(`❌ Analytics failed for ${client.company}:`, error);
      }
    }
    
    console.log(`\n✅ Bulk operations completed`);
    
  } catch (error) {
    console.error("❌ Bulk operations failed:", error);
    throw error;
  }
}
```

---

## 🔄 N8N Integration Examples

### Example 13: N8N Workflow for Automated Invoice Processing

```javascript
// N8N HTTP Request Node Configuration
{
  "method": "POST",
  "url": "http://localhost:3001/execute/create_invoice",
  "headers": {
    "Content-Type": "application/json",
    "X-API-Key": "your-api-key"
  },
  "body": {
    "client_id": "{{ $json.customer_id }}",
    "date": "{{ $now.format('YYYY-MM-DD') }}",
    "duedate": "{{ $now.add(30, 'days').format('YYYY-MM-DD') }}",
    "items": [
      {
        "description": "{{ $json.service_description }}",
        "qty": "{{ $json.quantity }}",
        "rate": "{{ $json.unit_price }}"
      }
    ]
  }
}
```

### Example 14: N8N Lead Processing Workflow

```javascript
// N8N Webhook -> MCP Perfex CRM -> Email Notification
[
  {
    "name": "Webhook - New Lead",
    "type": "n8n-nodes-base.webhook",
    "parameters": {
      "path": "new-lead",
      "responseMode": "responseNode"
    }
  },
  {
    "name": "Create Lead in Perfex",
    "type": "n8n-nodes-base.httpRequest",
    "parameters": {
      "url": "http://localhost:3001/execute/create_lead",
      "method": "POST",
      "body": {
        "name": "{{ $json.name }}",
        "company": "{{ $json.company }}",
        "email": "{{ $json.email }}",
        "phone": "{{ $json.phone }}",
        "source": "Website Form",
        "value": "{{ $json.estimated_value }}"
      }
    }
  },
  {
    "name": "Assign Lead",
    "type": "n8n-nodes-base.httpRequest",
    "parameters": {
      "url": "http://localhost:3001/execute/assign_lead",
      "method": "POST",
      "body": {
        "lead_id": "{{ $json.lead_id }}",
        "staff_id": 3
      }
    }
  },
  {
    "name": "Send Notification Email",
    "type": "n8n-nodes-base.emailSend",
    "parameters": {
      "to": "sales@yourcompany.com",
      "subject": "New Lead: {{ $('Webhook - New Lead').first().json.company }}",
      "text": "A new lead has been created and assigned. Lead ID: {{ $('Create Lead in Perfex').first().json.lead_id }}"
    }
  }
]
```

---

## ⚠️ Error Handling

### Example 15: Robust Error Handling Patterns

```typescript
async function robustOperation() {
  try {
    // Wrap MCP calls with proper error handling
    const result = await safeExecuteMCPTool("get_customers", { limit: 50 });
    
    if (!result.success) {
      throw new Error(`MCP operation failed: ${result.error}`);
    }
    
    return result.data;
    
  } catch (error) {
    console.error("Operation failed:", error);
    
    // Implement fallback logic
    return await fallbackOperation();
  }
}

async function safeExecuteMCPTool(toolName: string, args: any, retries: number = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await use_mcp_tool({
        server_name: "mcp-perfex-crm",
        tool_name: toolName,
        arguments: args
      });
      
      const data = JSON.parse(result.content[0].text);
      
      // Check for application-level errors
      if (data.error || result.content[0].text.includes("Error:")) {
        throw new Error(data.error || result.content[0].text);
      }
      
      return { success: true, data: data };
      
    } catch (error) {
      console.warn(`Attempt ${attempt}/${retries} failed:`, error);
      
      if (attempt === retries) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error),
          attempts: retries
        };
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}

async function fallbackOperation(): Promise<any> {
  // Implement fallback logic
  console.log("🔄 Executing fallback operation...");
  
  // Return cached data or default values
  return {
    customers: [],
    message: "Using cached data due to connection issues",
    timestamp: new Date().toISOString()
  };
}

// Usage with comprehensive error handling
async function processWithErrorHandling() {
  try {
    // 1. Test connection first
    const healthCheck = await safeExecuteMCPTool("get_customers", { limit: 1 });
    
    if (!healthCheck.success) {
      console.error("❌ MCP server is not responding");
      return await fallbackOperation();
    }
    
    console.log("✅ Connection verified");
    
    // 2. Execute main operations
    const customers = await safeExecuteMCPTool("get_customers", { limit: 100 });
    const invoices = await safeExecuteMCPTool("get_invoices", { limit: 50 });
    
    // 3. Process results
    if (customers.success && invoices.success) {
      console.log(`📊 Processed ${customers.data.pagination.total} customers and ${invoices.data.pagination.total} invoices`);
      
      return {
        customers: customers.data,
        invoices: invoices.data,
        status: "success"
      };
    } else {
      console.warn("⚠️ Partial failure in data retrieval");
      
      return {
        customers: customers.success ? customers.data : null,
        invoices: invoices.success ? invoices.data : null,
        status: "partial_success",
        errors: {
          customers: customers.error,
          invoices: invoices.error
        }
      };
    }
    
  } catch (error) {
    console.error("❌ Critical error:", error);
    
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      fallback_data: await fallbackOperation()
    };
  }
}
```

---

**🎯 These examples demonstrate real-world usage patterns for MCP Perfex CRM, covering everything from basic operations to complex business workflows and robust error handling.**

**🔗 Related Documentation:**
- [DOCUMENTATION.md](./DOCUMENTATION.md) - Complete project documentation
- [API.md](./API.md) - API reference guide  
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Troubleshooting guide
- [README.md](./README.md) - Project overview