import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { applyBrandColors } from './config/brand'
import { applyTheme, initialTheme } from './lib/theme'

applyBrandColors()
applyTheme(initialTheme())
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
