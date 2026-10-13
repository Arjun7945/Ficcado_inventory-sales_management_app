import http from 'http';

function fetchUrl(urlPath) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:3000${urlPath}`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', (err) => {
      resolve({ status: 0, error: err.message });
    });
  });
}

async function test() {
  console.log('Fetching /api/items...');
  const itemsRes = await fetchUrl('/api/items');
  console.log('Items API Result:', JSON.stringify(itemsRes, null, 2));

  console.log('\nFetching /api/inventory...');
  const invRes = await fetchUrl('/api/inventory');
  console.log('Inventory API Result:', JSON.stringify(invRes, null, 2));
}

test();
