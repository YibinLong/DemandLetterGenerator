// Database seed script with sample test data
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { getDatabase, initializeDatabase } from './connection.js';

const SALT_ROUNDS = 10;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function seedDatabase(): Promise<void> {
  const db = getDatabase();

  // Check if data already exists
  const existingFirm = db.prepare('SELECT COUNT(*) as count FROM firms').get() as { count: number };
  if (existingFirm.count > 0) {
    console.log('Database already has data, skipping seed');
    return;
  }

  console.log('Seeding database with sample data...');

  // Create sample firms
  const firmIds = {
    firm1: uuidv4(),
    firm2: uuidv4()
  };

  db.prepare(`
    INSERT INTO firms (id, name, address, phone, email, website)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    firmIds.firm1,
    'Anderson & Associates Law Firm',
    '123 Legal Street, Suite 400, New York, NY 10001',
    '(212) 555-0100',
    'contact@andersonlaw.com',
    'https://andersonlaw.com'
  );

  db.prepare(`
    INSERT INTO firms (id, name, address, phone, email, website)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    firmIds.firm2,
    'Smith Legal Partners',
    '456 Justice Ave, Los Angeles, CA 90001',
    '(310) 555-0200',
    'info@smithlegal.com',
    'https://smithlegal.com'
  );

  // Create sample users
  const userIds = {
    admin: uuidv4(),
    attorney1: uuidv4(),
    attorney2: uuidv4(),
    paralegal1: uuidv4()
  };

  // Hash passwords (using 'password123' for all test users)
  const hashedPassword = await hashPassword('password123');

  const insertUser = db.prepare(`
    INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(userIds.admin, firmIds.firm1, 'admin@andersonlaw.com', hashedPassword, 'John', 'Anderson', 'admin');
  insertUser.run(userIds.attorney1, firmIds.firm1, 'sarah.jones@andersonlaw.com', hashedPassword, 'Sarah', 'Jones', 'attorney');
  insertUser.run(userIds.paralegal1, firmIds.firm1, 'mike.brown@andersonlaw.com', hashedPassword, 'Mike', 'Brown', 'paralegal');
  insertUser.run(userIds.attorney2, firmIds.firm2, 'jane.smith@smithlegal.com', hashedPassword, 'Jane', 'Smith', 'attorney');

  // Create sample templates
  const templateIds = {
    personalInjury: uuidv4(),
    autoAccident: uuidv4(),
    medicalMalpractice: uuidv4()
  };

  const insertTemplate = db.prepare(`
    INSERT INTO templates (id, firm_id, created_by, name, description, content, placeholders, category, is_shared, is_approved)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertTemplate.run(
    templateIds.personalInjury,
    firmIds.firm1,
    userIds.attorney1,
    'General Personal Injury Demand',
    'Standard demand letter template for personal injury cases',
    `[FIRM LETTERHEAD]

{{current_date}}

VIA CERTIFIED MAIL

{{recipient_name}}
{{recipient_address}}

RE: {{client_name}} - Personal Injury Claim
    Claim Number: {{claim_number}}
    Date of Loss: {{incident_date}}

Dear {{recipient_name}}:

This firm represents {{client_name}} regarding injuries sustained on {{incident_date}}. This letter serves as a formal demand for compensation for the damages suffered by our client.

FACTUAL SUMMARY:
{{incident_description}}

LIABILITY:
{{liability_analysis}}

DAMAGES:
Our client has suffered the following damages:

Medical Expenses: \${{medical_expenses}}
Lost Wages: \${{lost_wages}}
Pain and Suffering: \${{pain_and_suffering}}

TOTAL DEMAND: \${{demand_amount}}

We hereby demand the sum of \${{demand_amount}} in full settlement of all claims arising from this incident.

Please respond within thirty (30) days of receipt of this letter. Failure to respond may result in the initiation of legal proceedings without further notice.

Sincerely,

{{attorney_name}}
{{firm_name}}`,
    JSON.stringify([
      'current_date', 'recipient_name', 'recipient_address', 'client_name',
      'claim_number', 'incident_date', 'incident_description', 'liability_analysis',
      'medical_expenses', 'lost_wages', 'pain_and_suffering', 'demand_amount',
      'attorney_name', 'firm_name'
    ]),
    'Personal Injury',
    1,
    1
  );

  insertTemplate.run(
    templateIds.autoAccident,
    firmIds.firm1,
    userIds.attorney1,
    'Auto Accident Demand Letter',
    'Template for automobile accident injury claims',
    `[FIRM LETTERHEAD]

{{current_date}}

{{insurance_company}}
{{adjuster_name}}
{{insurance_address}}

RE: Insured: {{at_fault_party}}
    Claimant: {{client_name}}
    Claim Number: {{claim_number}}
    Date of Accident: {{incident_date}}

Dear {{adjuster_name}}:

I represent {{client_name}} for injuries sustained in an automobile accident that occurred on {{incident_date}}.

ACCIDENT DESCRIPTION:
{{accident_description}}

INJURIES AND TREATMENT:
{{injuries_description}}

DEMAND:
Based on the above, we demand compensation in the amount of \${{demand_amount}}.

Please contact our office within 30 days to discuss settlement.

Very truly yours,

{{attorney_name}}
{{firm_name}}`,
    JSON.stringify([
      'current_date', 'insurance_company', 'adjuster_name', 'insurance_address',
      'at_fault_party', 'client_name', 'claim_number', 'incident_date',
      'accident_description', 'injuries_description', 'demand_amount',
      'attorney_name', 'firm_name'
    ]),
    'Auto Accident',
    1,
    1
  );

  insertTemplate.run(
    templateIds.medicalMalpractice,
    firmIds.firm2,
    userIds.attorney2,
    'Medical Malpractice Demand',
    'Template for medical malpractice cases',
    `[FIRM LETTERHEAD]

{{current_date}}

{{recipient_name}}
{{hospital_name}}
{{recipient_address}}

RE: Notice of Medical Malpractice Claim
    Patient: {{client_name}}
    Date of Treatment: {{incident_date}}

Dear {{recipient_name}}:

This letter serves as formal notice of a medical malpractice claim on behalf of our client, {{client_name}}.

STANDARD OF CARE VIOLATION:
{{malpractice_description}}

DAMAGES:
{{damages_description}}

DEMAND:
We demand \${{demand_amount}} in compensation for the damages caused by the negligent medical care provided to our client.

Please direct all correspondence to our office.

Sincerely,

{{attorney_name}}
{{firm_name}}`,
    JSON.stringify([
      'current_date', 'recipient_name', 'hospital_name', 'recipient_address',
      'client_name', 'incident_date', 'malpractice_description',
      'damages_description', 'demand_amount', 'attorney_name', 'firm_name'
    ]),
    'Medical Malpractice',
    1,
    1
  );

  // Create sample demand letter
  const demandLetterId = uuidv4();
  db.prepare(`
    INSERT INTO demand_letters (id, user_id, firm_id, template_id, title, content, status, case_reference, client_name, recipient_name, incident_date, demand_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    demandLetterId,
    userIds.attorney1,
    firmIds.firm1,
    templateIds.autoAccident,
    'Johnson v. State Farm - Auto Accident Claim',
    'Draft demand letter content...',
    'draft',
    'CASE-2026-001',
    'Robert Johnson',
    'State Farm Insurance',
    '2025-11-15',
    75000
  );

  // Create version history for the demand letter
  db.prepare(`
    INSERT INTO demand_letter_versions (id, demand_letter_id, version_number, content, changed_by, change_summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(),
    demandLetterId,
    1,
    'Initial draft content...',
    userIds.attorney1,
    'Initial draft created'
  );

  console.log('Database seeded successfully!');
  console.log('\nSample login credentials:');
  console.log('  Email: admin@andersonlaw.com');
  console.log('  Password: password123');
  console.log('\nOther test users:');
  console.log('  - sarah.jones@andersonlaw.com (attorney)');
  console.log('  - mike.brown@andersonlaw.com (paralegal)');
  console.log('  - jane.smith@smithlegal.com (attorney at different firm)');
}

// CLI runner
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() || '');
if (isMainModule) {
  initializeDatabase();
  seedDatabase()
    .then(() => {
      console.log('\nSeed complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      process.exit(1);
    });
}

export default seedDatabase;
