import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/enrollment-store', () => ({
  enrollmentStore: {
    getOrganization: vi.fn(async () => ({
      org_id: 'org-1',
      policy_version: 3,
      policy_config: { rules: [{ rule_id: 'org', action: 'allow' }] },
      created_at: '2025-01-01T00:00:00.000Z',
    })),
  },
}));

vi.mock('@/lib/user-store', () => ({
  userStore: {
    listUsers: vi.fn(async () => ([{ user_id: 'u1', org_id: 'org-1', group_id: 'g1', email: 'u@test.com' }])),
  },
}));

vi.mock('@/lib/group-store', () => ({
  groupStore: {
    getPolicyByGroup: vi.fn(async () => ({ version: 4, rules: [{ rule_id: 'g', action: 'block' }], inherit_org_default: true, updated_at: '2025-01-02T00:00:00.000Z' })),
  },
}));

vi.mock('@/lib/policy-scope-store', () => ({
  policyScopeStore: {
    getPolicy: vi.fn(async () => ({ version: 5, rules: [{ rule_id: 'u', action: 'redact' }], updated_at: '2025-01-03T00:00:00.000Z' })),
  },
}));

import { resolveEffectivePolicy } from '@/lib/policy-resolver';

describe('resolveEffectivePolicy', () => {
  it('applies precedence user > group > org', async () => {
    const result = await resolveEffectivePolicy({ organizationId: 'org-1', userId: 'u1', email: 'u@test.com' });
    expect(result.groupIds).toEqual(['g1']);
    expect(result.policyVersion).toBe(5);
    expect(result.resolvedPolicy.rules).toEqual([{ rule_id: 'u', action: 'redact' }]);
  });
});
