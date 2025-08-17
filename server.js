import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import { Pool } from 'pg';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: '*' } });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors());
app.use(express.json());

// 拉取留言
app.get('/messages', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM public.messages ORDER BY created_at DESC LIMIT 100'
  );
  res.json(rows);
});

// 发布新留言
app.post('/messages', async (req, res) => {
  const { username, content } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO public.messages (username, content) VALUES ($1, $2) RETURNING *',
    [username || '匿名', content]
  );
  const msg = rows[0];
  // 通过 WebSocket 广播给所有在线客户端
  io.emit('new_message', msg);
  res.status(201).json(msg);
});

// WebSocket 连接
io.on('connection', socket => {
  console.log('Client connected:', socket.id);
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
