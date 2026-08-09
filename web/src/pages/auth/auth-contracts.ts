import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export type LoginRequest = z.infer<typeof loginSchema>

export type RegisterRequest = {
  name: string
  email: string
  password: string
  locale: 'en-IN'
  preferredCurrency: string
  termsAccepted: boolean
}

export type AuthResponse = {
  user: {
    id: string
    name: string
    preferredCurrency: string
  }
  token: string
}
