import fetch from 'node-fetch';

async function generate() {
    const orgRes = await fetch('http://localhost:3737/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'CLI Agent Org' })
    });
    const org = await orgRes.json();

    const tokenRes = await fetch(`http://localhost:3737/api/orgs/${org.org_id}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expires_in_hours: 1, max_uses: 5 })
    });
    const token = await tokenRes.json();
    console.log(token.token);
}
generate();
