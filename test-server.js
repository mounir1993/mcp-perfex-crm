import http from 'http';

// Simple test to check if our server starts
console.log('Testing server startup...');

setTimeout(() => {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/health',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      console.log('Response:', data);
      process.exit(0);
    });
  });

  req.on('error', (err) => {
    console.error('Request error:', err.message);
    process.exit(1);
  });

  req.end();
}, 8000); // Wait 8 seconds for server to start