import React from 'react';
import { createRoot } from 'react-dom/client';
import Game from './games/Putt.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <Game
    onFinish={(r) =>
      (document.getElementById('payload').textContent = 'ONFINISH ' + JSON.stringify(r))
    }
  />
);
