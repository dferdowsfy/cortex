const fs = require('fs');

const envContent = fs.readFileSync('web/.env.local', 'utf8');
const match = envContent.match(/FIREBASE_SERVICE_ACCOUNT_KEY=(.*)/);
const svcAccount = JSON.parse(match[1]);

const { GoogleAuth } = require('google-auth-library');
const auth = new GoogleAuth({
  credentials: svcAccount,
  scopes: ['https://www.googleapis.com/auth/firebase']
});

async function reenable() {
  const client = await auth.getClient();
  const tokenRes = await client.getAccessToken();
  const token = tokenRes.token;

  const url = 'https://firebasedatabase.googleapis.com/v1beta/projects/myagent-846c3/locations/us-central1/instances/myagent-846c3:reenable';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

reenable().catch(err => console.error(err));
