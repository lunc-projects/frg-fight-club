import React from 'react';
import { createRoot } from 'react-dom/client';
import RocketCrash from './games/RocketCrash.jsx';
import './styles.css';

// Dev-only harness: renders Rocket Crash without wallet/payment so the
// component can be smoke-tested headlessly. Not part of the built app.
function Harness() {
  return (
    <div className="app">
      <RocketCrash
        onFinish={(r) => {
          document.getElementById('payload').textContent = 'ONFINISH ' + JSON.stringify(r);
        }}
      />
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);
