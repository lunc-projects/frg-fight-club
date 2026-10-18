import React from 'react';
import { createRoot } from 'react-dom/client';
import Pinball from './games/Pinball.jsx';
import './styles.css';

// Dev-only harness: renders Pinball without wallet/payment so the
// table can be smoke-tested and calibrated headlessly.
function Harness() {
  return (
    <div className="app">
      <Pinball
        onFinish={(r) => {
          document.getElementById('payload').textContent = 'ONFINISH ' + JSON.stringify(r);
        }}
      />
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);
