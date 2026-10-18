import React from 'react';
import { createRoot } from 'react-dom/client';
import Mines from './games/Mines.jsx';
import './styles.css';

// Dev-only harness: renders Mines without wallet/payment so the
// component can be smoke-tested headlessly. Not part of the app.
function Harness() {
  return (
    <div className="app">
      <Mines
        onFinish={(r) => {
          document.getElementById('payload').textContent = 'ONFINISH ' + JSON.stringify(r);
        }}
      />
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);
