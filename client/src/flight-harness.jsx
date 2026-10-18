import React from 'react';
import { createRoot } from 'react-dom/client';
import Flight from './games/Flight.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <Flight
    onFinish={(r) =>
      (document.getElementById('payload').textContent = 'ONFINISH ' + JSON.stringify(r))
    }
  />
);
