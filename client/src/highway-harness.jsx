import React from 'react';
import { createRoot } from 'react-dom/client';
import Highway from './games/Highway.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <Highway
    onFinish={(r) =>
      (document.getElementById('payload').textContent = 'ONFINISH ' + JSON.stringify(r))
    }
  />
);
