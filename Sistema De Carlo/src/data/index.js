import { createDemoDB } from './demo'
import { createSupabaseDB } from './supabase'

/**
 * Seleção automática do banco:
 * - Com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env → Supabase (produção)
 * - Sem elas → modo DEMONSTRAÇÃO (dados no navegador), ideal para vender.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const db = url && key ? createSupabaseDB(url, key) : createDemoDB()
export const isDemo = db.mode === 'demo'
