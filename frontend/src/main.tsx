import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@flowstack-ui/brick/reset.css'
import '@flowstack-ui/brick/styles.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
