import app from "./app";
import { connectDB } from "./core/database/connection";

const port = 3000;

async function start() {
    await connectDB();
    app.listen(port, () => {
        console.log(`🚀 Servidor aberto na porta ${port} 🚀`);
    })
}

start();