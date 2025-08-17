import { Client } from 'pg';

const client = new Client({
  connectionString: postgresql://postgres:jRXWdoaroBXueWnAsoITiOqPCMXxLLFU@ballast.proxy.rlwy.net:52567/railway,
  // 你也可以写成单独的 host/port/user/password/database
});

export async function query(text: string, params?: any[]) {
  if (!client._connected) {
    await client.connect();
  }
  return client.query(text, params);
}
