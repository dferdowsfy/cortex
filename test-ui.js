fetch("http://localhost:3737/api/admin/audit/history").then(r => r.text()).then(t => console.log('Response:', t));
