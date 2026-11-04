-- Seed Data for Intelligent Legal Contract & Vendor Risk Analyzer

-- 0. Insert Default Organization
INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Legal Firm', 'default-firm')
ON CONFLICT (id) DO NOTHING;

-- 1. Insert Users (Password: Demo@123)
-- bcrypt hash cost 12: $2a$12$aec5oWgNpn42HizCXCfd0ul.0UtBQ6xMQlMNHdi7OFEzP6wXz59VW
INSERT INTO users (id, organization_id, name, email, password_hash, role, is_active, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'Alex Associate', 'associate@demo.com', '$2a$12$aec5oWgNpn42HizCXCfd0ul.0UtBQ6xMQlMNHdi7OFEzP6wXz59VW', 'associate', true, NOW()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000001', 'Patricia Partner', 'partner@demo.com', '$2a$12$aec5oWgNpn42HizCXCfd0ul.0UtBQ6xMQlMNHdi7OFEzP6wXz59VW', 'partner', true, NOW()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000001', 'Arthur Admin', 'admin@demo.com', '$2a$12$aec5oWgNpn42HizCXCfd0ul.0UtBQ6xMQlMNHdi7OFEzP6wXz59VW', 'admin', true, NOW())
ON CONFLICT (email) DO UPDATE 
SET password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    organization_id = EXCLUDED.organization_id,
    is_active = true;

-- 2. Insert Active Template
INSERT INTO templates (id, name, description, version, status, created_by, created_at, updated_at)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Standard Safe Vendor Template v1',
  'Standard corporate benchmark for low-risk vendor agreements. Enforces 12-month liability caps, Net 30 payments, 30-day convenience termination, 60-day non-renewal notice, and GDPR data safeguards.',
  1,
  'active',
  '22222222-2222-2222-2222-222222222222',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    status = EXCLUDED.status;

-- 3. Insert All 10 Template Clauses
INSERT INTO template_clauses (id, template_id, clause_type, title, text, is_required, version, created_at)
VALUES
  (
    'c0000001-0000-0000-0000-000000000001',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'liability',
    'Limitation of Liability',
    'Except for breaches of confidentiality obligations, indemnification obligations, or gross negligence, neither party aggregate liability arising out of or related to this Agreement shall exceed the total amount paid or payable by Customer to Vendor in the twelve (12) months preceding the incident giving rise to liability. In no event shall either party be liable for any indirect, incidental, consequential, special, or punitive damages.',
    true,
    1,
    NOW()
  ),
  (
    'c0000001-0000-0000-0000-000000000002',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'indemnity',
    'Mutual Indemnification',
    'Each party shall defend, indemnify, and hold harmless the other party, its officers, directors, employees, and agents from and against any third-party claims, liabilities, damages, and expenses (including reasonable attorney fees) arising from the indemnifying party material breach of this Agreement, gross negligence, or willful misconduct, or infringement of intellectual property rights, provided prompt written notice is given.',
    true,
    1,
    NOW()
  ),
  (
    'c0000001-0000-0000-0000-000000000003',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'termination',
    'Termination for Convenience and Cause',
    'Either party may terminate this Agreement without cause upon giving at least thirty (30) days prior written notice to the other party. Either party may terminate immediately upon written notice if the other party materially breaches this Agreement and fails to cure such breach within thirty (30) days of receiving written notice specifying the breach.',
    true,
    1,
    NOW()
  ),
  (
    'c0000001-0000-0000-0000-000000000004',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'auto_renewal',
    'Renewal Term and Notice',
    'This Agreement shall have an initial term of one (1) year. Thereafter, this Agreement may renew for successive one-year terms only upon mutual written agreement, or shall renew automatically only if neither party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.',
    true,
    1,
    NOW()
  ),
  (
    'c0000001-0000-0000-0000-000000000005',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'data_protection',
    'Data Protection and Security Safeguards',
    'Vendor shall implement and maintain commercially reasonable administrative, physical, and technical safeguards compliant with applicable data protection laws (including GDPR and CCPA) to protect Customer data. Vendor shall notify Customer in writing within twenty-four (24) hours of discovering any confirmed or suspected data security breach and shall not transfer or sell Customer data under any circumstance.',
    true,
    1,
    NOW()
  ),
  (
    'c0000001-0000-0000-0000-000000000006',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'ip_ownership',
    'Intellectual Property Ownership and Work Product',
    'Customer retains all right, title, and interest, including all Intellectual Property rights, in and to Customer Data, confidential materials, and any custom deliverables created specifically for Customer under this Agreement. Vendor retains ownership of its pre-existing tools and background IP, granting Customer a non-exclusive, perpetual, royalty-free license to use such background IP solely as integrated into the deliverables.',
    true,
    1,
    NOW()
  ),
  (
    'c0000001-0000-0000-0000-000000000007',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'payment_terms',
    'Payment Terms and Invoicing',
    'Customer shall pay all undisputed, properly itemized invoices within thirty (30) days (Net 30) of receipt of invoice. Late payments on undisputed amounts shall accrue interest at the lesser of 1.0% per month or the maximum rate permitted by law. Customer may withhold payment on disputed amounts in good faith without penalty while the dispute is being resolved.',
    true,
    1,
    NOW()
  ),
  (
    'c0000001-0000-0000-0000-000000000008',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'confidentiality',
    'Confidentiality Obligations and Exceptions',
    'Each party agrees to safeguard the Confidential Information of the other party with the same degree of care it uses for its own confidential information, but no less than reasonable care. Confidential Information shall not include information that is publicly known, already known without confidentiality restrictions, or independently developed. Obligations of confidentiality shall survive for three (3) years following termination, except for trade secrets which survive indefinitely.',
    true,
    1,
    NOW()
  ),
  (
    'c0000001-0000-0000-0000-000000000009',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'governing_law',
    'Governing Law and Jurisdiction',
    'This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to conflict of laws principles. Any legal suit, action, or proceeding arising out of or related to this Agreement shall be instituted exclusively in the state or federal courts located in Wilmington, Delaware, and each party irrevocably submits to such jurisdiction.',
    true,
    1,
    NOW()
  ),
  (
    'c0000001-0000-0000-0000-000000000010',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'warranty',
    'Warranties and Service Level Commitments',
    'Vendor warrants that the Services and Deliverables will perform in all material respects in accordance with the applicable documentation and specifications for a period of ninety (90) days from delivery. Vendor further warrants that the Services will be provided with professional diligence, in a workmanlike manner consistent with industry standards, and will not introduce any malware, viruses, or disabling code.',
    true,
    1,
    NOW()
  )
ON CONFLICT (template_id, clause_type) DO UPDATE
SET title = EXCLUDED.title,
    text = EXCLUDED.text,
    is_required = EXCLUDED.is_required;

