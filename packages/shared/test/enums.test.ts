import { describe, expect, it } from 'vitest';
import {
  MemberStatus,
  PaymentMethod,
  PoolStatus,
  RequestStatus,
  RequestStatusSchema,
  UserRole,
} from '../src/index.js';

describe('@teslapool/shared enums', () => {
  it('exports the domain role and status values from DESIGN §7.2', () => {
    expect(UserRole.PASSENGER).toBe('PASSENGER');
    expect(UserRole.DRIVER).toBe('DRIVER');
    expect(RequestStatus.REQUESTED).toBe('REQUESTED');
    expect(PoolStatus.ACCEPTED).toBe('ACCEPTED');
    expect(MemberStatus.ACTIVE).toBe('ACTIVE');
    expect(PaymentMethod.WALLET).toBe('WALLET');
  });

  it('validates request status with Zod', () => {
    expect(RequestStatusSchema.parse('MATCHED')).toBe('MATCHED');
    expect(() => RequestStatusSchema.parse('WAITING')).toThrow();
  });
});
