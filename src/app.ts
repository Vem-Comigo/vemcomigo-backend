import Express from 'express';
import { Request, Response } from 'express';

const app = Express();
app.use(Express.json());

app.get('/', (req: Request, res: Response) => {
    res.send("Olá mundo lindo e xeiroso");
})

export default app;