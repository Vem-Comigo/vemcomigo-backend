import dotenv from "dotenv";

dotenv.config({ quiet: true });

export const env = {
  bdUri: process.env.BD_URI || "",
  port: Number(process.env.PORT || 3000),
  contactOrigin: process.env.CONTACT_ORIGIN || "http://localhost:5173",
  mailApiKey: process.env.MAIL_API_KEY || "",
  mailFrom: process.env.MAIL_FROM || "",
  serverless:
    process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
  proxyKey: process.env.CONTACT_PROXY_KEY || "",
  rateLimitUrl: process.env.UPSTASH_REDIS_REST_URL || "",
  rateLimitToken: process.env.UPSTASH_REDIS_REST_TOKEN || "",
};
