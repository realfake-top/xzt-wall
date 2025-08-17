import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import { Pool } from 'pg';
import cors from 'cors';
import path from 'path';

// Initialize express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: '*' } });

// Connect to PostgreSQL using the DATABASE_URL provided by Railway
// See https://docs.railway.com/guides/postgresql#connect for the required env variables【173659314035416†L233-L243】.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Ensure the messages table exists; this will run on startup.
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.messages (
      id SERIAL PRIMARY KEY,
      username TEXT,
      content TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
}

app.use(cors());
app.use(express.json());

// Fetch the most recent messages from the database
app.get('/messages', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, content, created_at FROM public.messages ORDER BY created_at DESC LIMIT 100'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Create a new message in the database
app.post('/messages', async (req, res) => {
  const { username, content } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO public.messages (username, content) VALUES ($1, $2) RETURNING *',
      [username || '匿名', content]
    );
    const msg = rows[0];
    // Emit the new message to all connected WebSocket clients
    io.emit('new_message', msg);
    res.status(201).json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

// WebSocket connection handler
io.on('connection', socket => {
  console.log('Client connected:', socket.id);
});

// Serve the built React app from the "dist" folder
// This assumes you have run `npm run build` which outputs the static files to dist/.
const staticPath = path.join(process.cwd(), 'dist');
app.use(express.static(staticPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

// Start the server after ensuring the database table exists
async function start() {
  try {
    await ensureTable();
  } catch (err) {
    // 如果数据库初始化失败，记录错误后继续启动服务，
    // 这样至少静态页面可以访问，接口会返回 500 错误
    console.error('Database init failed:', err);
  }

  const port = process.env.PORT || 4000;
  server.listen(port, () => {
    console.log(`Server listening on ${port}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
});
