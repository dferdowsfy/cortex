import fetch from 'node-fetch';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3737/api';

async function runTests() {
    console.log('--- STARTING VALIDATION ---');

    // 1. Create Organization
    console.log('\n[1] Creating Organization...');
    const orgRes = await fetch(`${BASE_URL}/orgs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Secure Org ' + Date.now() })
    });
    const orgData = await orgRes.json();
    const orgId = orgData.org_id;

    if (!orgId) throw new Error('Failed to create org');

    // 2. Generate Token
    console.log('\n[2] Generating Enrollment Token...');
    const tokenRes = await fetch(`${BASE_URL}/orgs/${orgId}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expires_in_hours: 1, max_uses: 2 })
    });
    const tokenData = await tokenRes.json();
    const tokenValue = tokenData.token;

    if (!tokenValue) throw new Error('Failed to generate token');

    // 3. Enroll Device
    console.log('\n[3] Enrolling Device 1...');
    const device1Id = crypto.randomUUID();
    const enrollRes1 = await fetch(`${BASE_URL}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            enrollment_token: tokenValue,
            device_fingerprint: device1Id,
            os_type: 'macOS',
            agent_version: '1.0.0'
        })
    });
    const enrollData1 = await enrollRes1.json();
    console.log('Enrollment Response:', enrollData1);
    if (!enrollData1.device_id || !enrollData1.device_secret) {
        console.log('FAIL: Device 1 enrollment failed or missing secret');
        return;
    }

    const deviceSecret = enrollData1.device_secret;

    // Function to generate the required headers correctly (Note: using SHA256 of the plain secret as the HMAC key to match backend expectations exactly)
    const getAuthHeaders = (deviceId, plaintextSecret) => {
        const timestamp = Date.now().toString();
        const secretHash = crypto.createHash('sha256').update(plaintextSecret).digest('hex');
        const signature = crypto.createHmac('sha256', secretHash)
            .update(deviceId + timestamp)
            .digest('hex');

        return {
            'device_id': deviceId,
            'timestamp': timestamp,
            'signature': signature
        };
    };

    // 4. Update Policy
    console.log('\n[4] Updating Policy...');
    await fetch(`${BASE_URL}/orgs/${orgId}/policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            policy_config: { risk_threshold: 80, block_high_risk: true, auto_redaction: false, audit_mode: true, scan_attachments: true, retention_days: 30 }
        })
    });

    // 5. Get Policy endpoint test
    console.log('\n[5] Testing GET /policy for authenticated device...');
    const validHeaders = getAuthHeaders(device1Id, deviceSecret);
    console.log("Sending Headers:", validHeaders);

    const getPolicyRes = await fetch(`${BASE_URL}/policy`, { headers: validHeaders });
    const getPolicyData = await getPolicyRes.json();
    console.log('GET /policy Response (Expected Success):', getPolicyData);

    // 6. Test Heartbeat Endpoint
    console.log('\n[6] Testing Authenticated POST /heartbeat...');
    const beatRes = await fetch(`${BASE_URL}/heartbeat`, {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(device1Id, deviceSecret)
        },
        body: JSON.stringify({ status: 'active', agent_version: '1.0.1' })
    });
    console.log('Heartbeat Response:', await beatRes.json());

    // 7. Test missing headers
    console.log('\n[7] Testing GET /policy missing headers...');
    const invalidHeaders1 = { 'device_id': device1Id };
    const failRes1 = await fetch(`${BASE_URL}/policy`, { headers: invalidHeaders1 });
    console.log('GET /policy missing headers (Expected 400):', await failRes1.json());

    // 8. Test invalid signature
    console.log('\n[8] Testing GET /policy invalid signature...');
    const invalidHeaders2 = {
        'device_id': device1Id,
        'timestamp': Date.now().toString(),
        'signature': 'bad_fake_signature_hex'
    };
    const failRes2 = await fetch(`${BASE_URL}/policy`, { headers: invalidHeaders2 });
    console.log('GET /policy bad signature (Expected 401):', await failRes2.json());

    // 9. Test stale timestamp
    console.log('\n[9] Testing GET /policy stale timestamp (older than 5 min)...');
    const pastStamp = (Date.now() - 6 * 60 * 1000).toString(); // 6 mins ago
    const secretHash = crypto.createHash('sha256').update(deviceSecret).digest('hex');
    const pastSig = crypto.createHmac('sha256', secretHash).update(device1Id + pastStamp).digest('hex');
    const invalidHeaders3 = {
        'device_id': device1Id,
        'timestamp': pastStamp,
        'signature': pastSig
    };
    const failRes3 = await fetch(`${BASE_URL}/policy`, { headers: invalidHeaders3 });
    console.log('GET /policy stale timestamp (Expected 401):', await failRes3.json());

    console.log('\n--- VALIDATION COMPLETE ---');
}

runTests().catch(console.error);
