import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Apply saved theme before React renders to avoid flash
const _savedTheme = localStorage.getItem('elineas_theme') || 'dark'
document.documentElement.classList.add(_savedTheme)

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
