import { useEffect, useState } from 'react';

type HealthStatus = 'checking' | 'ok' | 'error';

function App() {
  const [status, setStatus] = useState<HealthStatus>('checking');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) {
          throw new Error('Health check failed');
        }
        return res.json();
      })
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'));
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Electronics Marketplace — Staff Portal</h1>
      <p>Scaffold check: frontend → backend connection.</p>
      {status === 'checking' && <p>Checking backend...</p>}
      {status === 'ok' && <p style={{ color: 'green' }}>✓ Connected to backend.</p>}
      {status === 'error' && <p style={{ color: 'red' }}>✗ Could not reach backend.</p>}
    </div>
  );
}

export default App;