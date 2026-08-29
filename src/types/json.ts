// Tipo padrão usado pela Supabase CLI para colunas jsonb quando o formato
// exato não é fixado em um tipo TS mais específico.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
