import { z } from 'zod';

export const UserRole = {
  PASSENGER: 'PASSENGER',
  DRIVER: 'DRIVER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const UserRoleSchema = z.enum([UserRole.PASSENGER, UserRole.DRIVER]);

export const RequestStatus = {
  REQUESTED: 'REQUESTED',
  MATCHED: 'MATCHED',
  DRIVER_ARRIVED: 'DRIVER_ARRIVED',
  STARTED: 'STARTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];
export const RequestStatusSchema = z.enum([
  RequestStatus.REQUESTED,
  RequestStatus.MATCHED,
  RequestStatus.DRIVER_ARRIVED,
  RequestStatus.STARTED,
  RequestStatus.COMPLETED,
  RequestStatus.CANCELLED,
]);

export const PoolStatus = {
  ACCEPTED: 'ACCEPTED',
  DRIVER_ARRIVED: 'DRIVER_ARRIVED',
  STARTED: 'STARTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type PoolStatus = (typeof PoolStatus)[keyof typeof PoolStatus];
export const PoolStatusSchema = z.enum([
  PoolStatus.ACCEPTED,
  PoolStatus.DRIVER_ARRIVED,
  PoolStatus.STARTED,
  PoolStatus.COMPLETED,
  PoolStatus.CANCELLED,
]);

export const MemberStatus = {
  ACTIVE: 'ACTIVE',
  LEFT: 'LEFT',
  REMOVED: 'REMOVED',
} as const;
export type MemberStatus = (typeof MemberStatus)[keyof typeof MemberStatus];
export const MemberStatusSchema = z.enum([
  MemberStatus.ACTIVE,
  MemberStatus.LEFT,
  MemberStatus.REMOVED,
]);

export const PaymentMethod = {
  CASH: 'CASH',
  WALLET: 'WALLET',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
export const PaymentMethodSchema = z.enum([PaymentMethod.CASH, PaymentMethod.WALLET]);
