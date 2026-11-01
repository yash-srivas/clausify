const workflow = require('../src/services/contractWorkflow');
const db = require('../src/config/db');

describe('Contract State Machine & Workflow Transitions', () => {
  let testContractId;

  beforeAll(async () => {
    const res = await db.query(
      `INSERT INTO contracts (title, original_filename, file_path, uploaded_by, status)
       VALUES ('Workflow Test Contract', 'test.pdf', '/tmp/test.pdf', '11111111-1111-1111-1111-111111111111', 'uploaded')
       RETURNING id`
    );
    testContractId = res.rows[0].id;
  });

  afterAll(async () => {
    if (testContractId) {
      await db.query('DELETE FROM contracts WHERE id = $1', [testContractId]);
    }
  });

  test('canTransition logic strictly enforces legal transitions', () => {
    // Legal transitions
    expect(workflow.canTransition('uploaded', 'processing')).toBe(true);
    expect(workflow.canTransition('processing', 'analyzed')).toBe(true);
    expect(workflow.canTransition('analyzed', 'in_review')).toBe(true);
    expect(workflow.canTransition('in_review', 'escalated')).toBe(true);
    expect(workflow.canTransition('escalated', 'approved')).toBe(true);
    expect(workflow.canTransition('escalated', 'in_review')).toBe(true); // changes requested

    // Illegal transitions
    expect(workflow.canTransition('uploaded', 'approved')).toBe(false);
    expect(workflow.canTransition('uploaded', 'escalated')).toBe(false);
    expect(workflow.canTransition('approved', 'processing')).toBe(false);
    expect(workflow.canTransition('processing', 'approved')).toBe(false);
  });

  test('transitionContract executes legal transitions and rejects illegal transitions with 409', async () => {
    // 1. uploaded -> processing
    const s1 = await workflow.transitionContract(testContractId, 'processing');
    expect(s1.status).toBe('processing');

    // 2. Illegal transition: processing -> approved throws 409
    await expect(workflow.transitionContract(testContractId, 'approved')).rejects.toMatchObject({
      status: 409,
      code: 'INVALID_STATUS_TRANSITION',
    });

    // 3. processing -> analyzed
    const s2 = await workflow.transitionContract(testContractId, 'analyzed');
    expect(s2.status).toBe('analyzed');

    // 4. analyzed -> in_review -> escalated
    await workflow.transitionContract(testContractId, 'in_review');
    const s3 = await workflow.transitionContract(testContractId, 'escalated');
    expect(s3.status).toBe('escalated');

    // 5. escalated -> approved
    const s4 = await workflow.transitionContract(testContractId, 'approved');
    expect(s4.status).toBe('approved');
  });
});
