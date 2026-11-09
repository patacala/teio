// Stand-in for Supabase Auth during visual tests: the Next middleware calls
// GET /auth/v1/user server-side to validate the session cookie.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const user = JSON.parse(readFileSync(new URL('./test-user.json', import.meta.url), 'utf8'));
const port = Number(process.env.MOCK_SUPABASE_PORT ?? 54399);

createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  if (req.method === 'OPTIONS') return res.end();
  if (req.url?.startsWith('/auth/v1/user')) return res.end(JSON.stringify(user));
  if (req.url === '/health') return res.end('{"ok":true}');
  res.statusCode = 404;
  res.end('{}');
}).listen(port, '127.0.0.1', () => console.log(`mock supabase on ${port}`));
