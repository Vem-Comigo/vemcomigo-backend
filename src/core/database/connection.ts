import { MongoClient } from "mongodb";
import  { env } from "../../config/env";

let client: MongoClient;

export async function connectDB() {
  try {
    client = new MongoClient(env.bdUri);
    await client.connect();
    console.log("✅ Conectado ao MongoDB com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao conectar ao MongoDB:", error);
    process.exit(1);
  }
}
