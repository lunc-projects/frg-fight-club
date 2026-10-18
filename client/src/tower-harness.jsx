import React from 'react';
import { createRoot } from 'react-dom/client';
import Tower from './games/Tower.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <Tower
    onFinish={(r) =>
      (document.getElementById('payload').textContent = 'ONFINISH ' + JSON.stringify(r))
    }
  />
);
