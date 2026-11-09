import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WikiPageExample } from './wiki-page-example';

document.body.style.margin = '0';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WikiPageExample standalone />
  </StrictMode>,
);
