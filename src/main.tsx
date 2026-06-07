import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './auth'
import './styles.css'

const el = document.getElementById('root')!
createRoot(el).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
)
