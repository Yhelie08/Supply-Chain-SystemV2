import fs from 'node:fs';

const clientData = JSON.parse(fs.readFileSync('self_client.json', 'utf8'));

const params = new URLSearchParams();
params.append('grant_type', 'authorization_code');
params.append('client_id', clientData.client_id);
params.append('client_secret', clientData.client_secret);
params.append('code', clientData.code);

console.log('Exchanging authorization code with Zoho Accounts...');

try {
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    body: params,
  });

  const data = await res.json();
  console.log('Zoho Response:', JSON.stringify(data, null, 2));

  if (data.refresh_token) {
    const tokenInfo = {
      client_id: clientData.client_id,
      client_secret: clientData.client_secret,
      refresh_token: data.refresh_token,
      access_token: data.access_token,
      api_domain: data.api_domain || 'https://creator.zoho.com',
      token_type: data.token_type,
      expires_in: data.expires_in,
      created_at: new Date().toISOString()
    };
    fs.writeFileSync('server/zoho-credentials.json', JSON.stringify(tokenInfo, null, 2));
    console.log('SUCCESS! Refresh token saved to server/zoho-credentials.json');
  } else {
    console.error('Failed to obtain refresh token. Error:', data.error);
  }
} catch (err) {
  console.error('Network or fetch error:', err);
}
