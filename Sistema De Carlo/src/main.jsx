import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { applyBrandColors } from './config/brand'
import { applyTheme, initialTheme } from './lib/theme'
import { registerSW } from './lib/push'

applyBrandColors()
applyTheme(initialTheme())
registerSW()
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
