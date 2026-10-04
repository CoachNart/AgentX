import {z} from "zod";
const env=z.object({X_CLIENT_ID:z.string().min(1).optional(),X_CLIENT_SECRET:z.string().min(1).optional(),X_REDIRECT_URI:z.string().url().optional()}).parse(process.env);
export function xConfigured(){return Boolean(env.X_CLIENT_ID&&env.X_CLIENT_SECRET&&env.X_REDIRECT_URI)}
export function xOAuthConfig(){if(!xConfigured())throw new Error("X OAuth is not configured.");return {clientId:env.X_CLIENT_ID!,clientSecret:env.X_CLIENT_SECRET!,redirectUri:env.X_REDIRECT_URI!}}