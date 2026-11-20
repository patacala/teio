const fs = require('fs');
const path = require('path');

if (!process.env.TEST_DATABASE_URL) {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const line = fs
      .readFileSync(envPath, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('TEST_DATABASE_URL='));
    if (line) {
      process.env.TEST_DATABASE_URL = line.slice('TEST_DATABASE_URL='.length).trim();
    }
  }
}
