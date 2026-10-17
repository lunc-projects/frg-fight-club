import React from 'react';
import { createRoot } from 'react-dom/client';
import PrizeWheel from './games/PrizeWheel.jsx';
import './styles.css';

// Dev-only harness: renders the wheel without wallet/payment so the
// component can be smoke-tested headlessly. Not part of the built app.
function Harness() {
  return (
    <div className="app">
      <PrizeWheel
        onFinish={(r) => {
          document.getElementById('payload').textContent = 'ONFINISH ' + JSON.stringify(r);
        }}
      />
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);
