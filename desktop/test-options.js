const http = require('http');

const server = http.createServer((req, res) => {
    console.log("Server received request:", req.url);
    res.writeHead(200);
    res.end('ok');
});
server.listen(8090, () => {
    const req = http.request({
        hostname: '127.0.0.1',
        port: 8091,
        path: '/v1/chat',
        headers: { 'Host': 'api.openai.com' },
        agent: new http.Agent({ host: '127.0.0.1', port: 8090 })
    }, (res) => {
        console.log("Res:", res.statusCode);
        server.close();
    });
    req.on('error', e => {
        console.log("Error:", e.message);
        server.close();
    });
    req.end();
});
