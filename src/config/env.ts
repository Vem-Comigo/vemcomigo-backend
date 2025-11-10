import dotenv from "dotenv";

dotenv.config();

export const env = {
    bdUri: process.env.BD_URI || '',
}