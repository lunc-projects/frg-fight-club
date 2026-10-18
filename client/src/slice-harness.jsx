import React from 'react';
import { createRoot } from 'react-dom/client';
import Slice from './games/Slice.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <Slice
    onFinish={(r) =>
      (document.getElementById('payload').textContent = 'ONFINISH ' + JSON.stringify(r))
    }
  />
);
