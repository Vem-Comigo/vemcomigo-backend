import mongoose from "mongoose"; 
import  { env } from "../../config/env";

export async function connectDB() {
  try {
    await mongoose.connect(env.bdUri);
    console.log("✅ Conectado ao MongoDB com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao conectar ao MongoDB:", error);
    process.exit(1);
  }
}
