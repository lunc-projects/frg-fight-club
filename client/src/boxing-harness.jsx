import React from 'react';
import { createRoot } from 'react-dom/client';
import Boxing from './games/Boxing.jsx';
import './styles.css';

// Dev-only harness: renders the boxing game without wallet/payment.
function Harness() {
  return (
    <div className="app">
      <Boxing
        onFinish={(r) => {
          document.getElementById('payload').textContent = 'ONFINISH ' + JSON.stringify(r);
        }}
      />
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);
