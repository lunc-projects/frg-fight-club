import React from 'react';
import { createRoot } from 'react-dom/client';
import Breakout from './games/Breakout.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <Breakout
    onFinish={(r) =>
      (document.getElementById('payload').textContent = 'ONFINISH ' + JSON.stringify(r))
    }
  />
);
