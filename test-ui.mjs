const response = await fetch("http://localhost:3737/api/admin/audit/history");
const text = await response.text();
console.log('Response:', text);
