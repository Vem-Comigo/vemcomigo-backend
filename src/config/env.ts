import dotenv from "dotenv";

dotenv.config();

export const env = {
  bdUri: process.env.BD_URI || "",
  port: Number(process.env.PORT || 3000),
  contactOrigin: process.env.CONTACT_ORIGIN || "http://localhost:5173",
  mailApiKey: process.env.MAIL_API_KEY || "",
  mailFrom: process.env.MAIL_FROM || "",
  mailTo: process.env.MAIL_TO || "",
};
