const fs = require('fs');
const path = require('path');
const { Pool } = require(path.join(__dirname, '../backend/node_modules/pg'));
const bcrypt = require(path.join(__dirname, '../backend/node_modules/bcryptjs'));
require(path.join(__dirname, '../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../backend/.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/legal_risk_analyzer';
const pool = new Pool({ connectionString });

// Deterministic mock embedding generator matching Python MockEmbedder
function generateMockEmbedding(text, dim = 1536) {
  const vec = new Array(dim).fill(0);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  
  if (words.length === 0) {
    vec[0] = 1.0;
    return `[${vec.join(',')}]`;
  }

  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dim;
    const sign = (Math.abs(hash >> 8) % 2 === 0) ? 1.0 : -1.0;
    vec[idx] += sign;
  }

  let sumSq = 0;
  for (let i = 0; i < dim; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq) || 1.0;
  for (let i = 0; i < dim; i++) {
    vec[i] = Number((vec[i] / norm).toFixed(6));
  }

  return `[${vec.join(',')}]`;
}

async function seed() {
  console.log(`[Seed] Seeding database at ${connectionString}...`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Seed users
    const passwordHash = bcrypt.hashSync('Demo@123', 12);
    const users = [
      { id: '11111111-1111-1111-1111-111111111111', name: 'Alex Associate', email: 'associate@demo.com', role: 'associate' },
      { id: '22222222-2222-2222-2222-222222222222', name: 'Patricia Partner', email: 'partner@demo.com', role: 'partner' },
      { id: '33333333-3333-3333-3333-333333333333', name: 'Arthur Admin', email: 'admin@demo.com', role: 'admin' }
    ];

    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, is_active = true`,
        [u.id, u.name, u.email, passwordHash, u.role]
      );
    }
    console.log('[Seed] Users seeded: associate@demo.com, partner@demo.com, admin@demo.com');

    // 2. Seed active template
    const templateId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await client.query(
      `INSERT INTO templates (id, name, description, version, status, created_by)
       VALUES ($1, $2, $3, 1, 'active', $4)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status`,
      [
        templateId,
        'Standard Safe Vendor Template v1',
        'Standard corporate benchmark for low-risk vendor agreements. Enforces 12-month liability caps, Net 30 payments, 30-day convenience termination, 60-day non-renewal notice, and GDPR data safeguards.',
        users[1].id
      ]
    );
    console.log('[Seed] Active template created: Standard Safe Vendor Template v1');

    // 3. Seed template clauses
    const clauses = [
      {
        id: 'c0000001-0000-0000-0000-000000000001',
        type: 'liability',
        title: 'Limitation of Liability',
        text: 'Except for breaches of confidentiality obligations, indemnification obligations, or gross negligence, neither party aggregate liability arising out of or related to this Agreement shall exceed the total amount paid or payable by Customer to Vendor in the twelve (12) months preceding the incident giving rise to liability. In no event shall either party be liable for any indirect, incidental, consequential, special, or punitive damages.'
      },
      {
        id: 'c0000001-0000-0000-0000-000000000002',
        type: 'indemnity',
        title: 'Mutual Indemnification',
        text: 'Each party shall defend, indemnify, and hold harmless the other party, its officers, directors, employees, and agents from and against any third-party claims, liabilities, damages, and expenses (including reasonable attorney fees) arising from the indemnifying party material breach of this Agreement, gross negligence, or willful misconduct, or infringement of intellectual property rights, provided prompt written notice is given.'
      },
      {
        id: 'c0000001-0000-0000-0000-000000000003',
        type: 'termination',
        title: 'Termination for Convenience and Cause',
        text: 'Either party may terminate this Agreement without cause upon giving at least thirty (30) days prior written notice to the other party. Either party may terminate immediately upon written notice if the other party materially breaches this Agreement and fails to cure such breach within thirty (30) days of receiving written notice specifying the breach.'
      },
      {
        id: 'c0000001-0000-0000-0000-000000000004',
        type: 'auto_renewal',
        title: 'Renewal Term and Notice',
        text: 'This Agreement shall have an initial term of one (1) year. Thereafter, this Agreement may renew for successive one-year terms only upon mutual written agreement, or shall renew automatically only if neither party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.'
      },
      {
        id: 'c0000001-0000-0000-0000-000000000005',
        type: 'data_protection',
        title: 'Data Protection and Security Safeguards',
        text: 'Vendor shall implement and maintain commercially reasonable administrative, physical, and technical safeguards compliant with applicable data protection laws (including GDPR and CCPA) to protect Customer data. Vendor shall notify Customer in writing within twenty-four (24) hours of discovering any confirmed or suspected data security breach and shall not transfer or sell Customer data under any circumstance.'
      },
      {
        id: 'c0000001-0000-0000-0000-000000000006',
        type: 'ip_ownership',
        title: 'Intellectual Property Ownership and Work Product',
        text: 'Customer retains all right, title, and interest, including all Intellectual Property rights, in and to Customer Data, confidential materials, and any custom deliverables created specifically for Customer under this Agreement. Vendor retains ownership of its pre-existing tools and background IP, granting Customer a non-exclusive, perpetual, royalty-free license to use such background IP solely as integrated into the deliverables.'
      },
      {
        id: 'c0000001-0000-0000-0000-000000000007',
        type: 'payment_terms',
        title: 'Payment Terms and Invoicing',
        text: 'Customer shall pay all undisputed, properly itemized invoices within thirty (30) days (Net 30) of receipt of invoice. Late payments on undisputed amounts shall accrue interest at the lesser of 1.0% per month or the maximum rate permitted by law. Customer may withhold payment on disputed amounts in good faith without penalty while the dispute is being resolved.'
      },
      {
        id: 'c0000001-0000-0000-0000-000000000008',
        type: 'confidentiality',
        title: 'Confidentiality Obligations and Exceptions',
        text: 'Each party agrees to safeguard the Confidential Information of the other party with the same degree of care it uses for its own confidential information, but no less than reasonable care. Confidential Information shall not include information that is publicly known, already known without confidentiality restrictions, or independently developed. Obligations of confidentiality shall survive for three (3) years following termination, except for trade secrets which survive indefinitely.'
      },
      {
        id: 'c0000001-0000-0000-0000-000000000009',
        type: 'governing_law',
        title: 'Governing Law and Jurisdiction',
        text: 'This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to conflict of laws principles. Any legal suit, action, or proceeding arising out of or related to this Agreement shall be instituted exclusively in the state or federal courts located in Wilmington, Delaware, and each party irrevocably submits to such jurisdiction.'
      },
      {
        id: 'c0000001-0000-0000-0000-000000000010',
        type: 'warranty',
        title: 'Warranties and Service Level Commitments',
        text: 'Vendor warrants that the Services and Deliverables will perform in all material respects in accordance with the applicable documentation and specifications for a period of ninety (90) days from delivery. Vendor further warrants that the Services will be provided with professional diligence, in a workmanlike manner consistent with industry standards, and will not introduce any malware, viruses, or disabling code.'
      }
    ];

    for (const c of clauses) {
      const embedding = generateMockEmbedding(c.text);
      await client.query(
        `INSERT INTO template_clauses (id, template_id, clause_type, title, text, is_required, embedding, version)
         VALUES ($1, $2, $3, $4, $5, true, $6::vector, 1)
         ON CONFLICT (template_id, clause_type) DO UPDATE
         SET title = EXCLUDED.title, text = EXCLUDED.text, embedding = EXCLUDED.embedding, is_required = true`,
        [c.id, templateId, c.type, c.title, c.text, embedding]
      );
    }
    console.log('[Seed] 10 template clauses seeded and embedded successfully!');

    await client.query('COMMIT');
    console.log('[Seed] Seeding completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed] Error during seeding:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seed();
}

module.exports = { seed, generateMockEmbedding };
