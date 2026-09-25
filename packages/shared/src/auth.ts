import { z } from 'zod';

export const SignupBodySchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  phone: z.string().min(5).max(32),
  password: z.string().min(8).max(200),
});
export type SignupBody = z.infer<typeof SignupBodySchema>;

export const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;
