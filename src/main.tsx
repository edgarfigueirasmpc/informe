import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CloudProvider } from './components/Cloud';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CloudProvider><App /></CloudProvider>
  </StrictMode>,
);
