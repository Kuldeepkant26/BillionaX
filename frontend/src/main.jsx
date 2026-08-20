import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Tailwind first: its preflight is a reset, and the app's own resets and
// component styles below are meant to win over it.
import './styles/tailwind.css'
import './index.css'
import './styles/themes.css'
import './styles/components.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
