require('dotenv').config({
  path: require('path').resolve(__dirname, '..', '.env'),
  quiet: true
});

const http = require('http');
const net = require('net');

const publicHost = process.env.PUBLIC_GATEWAY_HOST || '127.0.0.1';
const publicPort = Number(process.env.PUBLIC_GATEWAY_PORT || 5001);
const targetHost = process.env.PUBLIC_GATEWAY_TARGET_HOST || '127.0.0.1';
const targetPort = Number(process.env.PUBLIC_GATEWAY_TARGET_PORT || 5003);
const lanHost = String(process.env.LAN_GATEWAY_HOST || '').trim();
const lanPort = Number(process.env.LAN_GATEWAY_PORT || 5000);

function targetHeaders(sourceHeaders, defaultProto) {
  const headers = { ...sourceHeaders, host: `${targetHost}:${targetPort}` };
  headers['x-forwarded-host'] = sourceHeaders.host || '';
  headers['x-forwarded-proto'] = defaultProto;
  return headers;
}

function createGateway(defaultProto) {
  const server = http.createServer((request, response) => {
    const proxyRequest = http.request({
      host: targetHost,
      port: targetPort,
      method: request.method,
      path: request.url,
      headers: targetHeaders(request.headers, defaultProto)
    }, (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    });

    proxyRequest.on('error', (error) => {
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(`Upstream unavailable: ${error.message}`);
    });

    request.pipe(proxyRequest);
  });

  server.on('upgrade', (request, socket, head) => {
    const upstream = net.connect(targetPort, targetHost, () => {
      const headers = targetHeaders(request.headers, defaultProto);
      const headerLines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);
      upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headerLines.join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });

    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });

  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  server.on('error', (error) => {
    console.error(`Gateway error: ${error.message}`);
    process.exit(1);
  });

  return server;
}

const servers = [];
const publicServer = createGateway('https');
servers.push(publicServer);
publicServer.listen(publicPort, publicHost, () => {
  console.log(`Public gateway listening on http://${publicHost}:${publicPort}`);
  console.log(`Traffic is forwarded to http://${targetHost}:${targetPort}`);
});

if (lanHost) {
  const lanServer = createGateway('http');
  servers.push(lanServer);
  lanServer.listen(lanPort, lanHost, () => {
    console.log(`LAN fallback listening on http://${lanHost}:${lanPort}`);
  });
}

function shutdown() {
  let remaining = servers.length;
  for (const server of servers) {
    server.close(() => {
      remaining -= 1;
      if (remaining === 0) process.exit(0);
    });
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
