const http = require('http');

async function test() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1', 
            port: 8080,
            method: 'POST',
            path: 'http://api.openai.com/v1/chat/completions', // Full URL for proxy
            headers: {
                'Host': 'api.openai.com', 
                'Content-Type': 'application/json',
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
        });

        req.on('error', (e) => resolve({ error: e.message }));
        req.write(JSON.stringify({ prompt: "hello" }));
        req.end();
    });
}
test().then(console.log);
