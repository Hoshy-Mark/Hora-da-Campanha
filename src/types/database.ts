// Tipos gerados manualmente a partir de supabase/schema.sql, no formato que
// @supabase/postgrest-js (v2.112+) exige: cada tabela precisa de Row/Insert/
// Update/Relationships, e o schema precisa expor Tables/Views/Functions.
//
// Quando o projeto Supabase existir de verdade, prefira gerar isto via:
//   npx supabase gen types typescript --project-id SEU_ID > src/types/database.ts

import type { SheetData } from './game-system';
import type { Json } from './json';
import type { TemplateAbility, TemplateItem } from './monster-template';
import type { TileMapData } from './tilemap';

type Relationships = { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string; created_at: string };
        Insert: { id: string; display_name: string; created_at?: string };
        Update: Partial<{ display_name: string }>;
        Relationships: Relationships;
      };
      game_systems: {
        Row: { id: string; owner_id: string; name: string; schema: Json; created_at: string; updated_at: string };
        // Criação/edição sempre via RPC create_game_system / update_game_system.
        Insert: { id?: string; owner_id: string; name: string; schema: Json; created_at?: string; updated_at?: string };
        Update: Partial<{ name: string; schema: Json; updated_at: string }>;
        Relationships: Relationships;
      };
      campaigns: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          gm_id: string;
          game_system_id: string;
          current_map_id: string | null;
          created_at: string;
        };
        // Criação sempre via RPC create_campaign.
        Insert: { id?: string; name: string; invite_code: string; gm_id: string; game_system_id: string; created_at?: string };
        Update: Partial<{ name: string; current_map_id: string | null }>;
        Relationships: Relationships;
      };
      campaign_members: {
        Row: { campaign_id: string; user_id: string; role: 'gm' | 'player'; joined_at: string };
        // Inserção sempre via RPC join_campaign/create_campaign.
        Insert: { campaign_id: string; user_id: string; role: 'gm' | 'player'; joined_at?: string };
        Update: Record<string, never>;
        Relationships: Relationships;
      };
      characters: {
        Row: {
          id: string;
          campaign_id: string;
          owner_id: string | null;
          name: string;
          sheet_data: SheetData;
          is_npc: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          owner_id?: string | null;
          name: string;
          sheet_data?: SheetData;
          is_npc?: boolean;
        };
        Update: Partial<{ name: string; sheet_data: SheetData }>;
        Relationships: Relationships;
      };
      character_secrets: {
        Row: { id: string; character_id: string; campaign_id: string; title: string; content: string; created_at: string };
        Insert: { id?: string; character_id: string; campaign_id: string; title: string; content: string };
        Update: Partial<{ title: string; content: string }>;
        Relationships: Relationships;
      };
      character_abilities: {
        Row: {
          id: string;
          character_id: string;
          campaign_id: string;
          name: string;
          category: string | null;
          cost: string | null;
          tier: string | null;
          description: string | null;
          visible_to_player: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          character_id: string;
          campaign_id: string;
          name: string;
          category?: string | null;
          cost?: string | null;
          tier?: string | null;
          description?: string | null;
          visible_to_player?: boolean;
        };
        Update: Partial<{
          name: string;
          category: string | null;
          cost: string | null;
          tier: string | null;
          description: string | null;
          visible_to_player: boolean;
        }>;
        Relationships: Relationships;
      };
      inventory_items: {
        Row: {
          id: string;
          campaign_id: string;
          character_id: string | null;
          name: string;
          description: string | null;
          quantity: number;
          visible_to_player: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          character_id?: string | null;
          name: string;
          description?: string | null;
          quantity?: number;
          visible_to_player?: boolean;
        };
        Update: Partial<{
          character_id: string | null;
          name: string;
          description: string | null;
          quantity: number;
          visible_to_player: boolean;
        }>;
        Relationships: Relationships;
      };
      gm_notes: {
        Row: {
          id: string;
          campaign_id: string;
          character_id: string | null;
          title: string;
          content: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; campaign_id: string; character_id?: string | null; title: string; content?: string | null };
        Update: Partial<{ title: string; content: string | null; updated_at: string }>;
        Relationships: Relationships;
      };
      initiative_entries: {
        Row: {
          id: string;
          campaign_id: string;
          character_id: string | null;
          label: string;
          initiative: number;
          is_current: boolean;
          visible_to_player: boolean;
          status_effects: string[];
          is_defeated: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          character_id?: string | null;
          label: string;
          initiative?: number;
          is_current?: boolean;
          visible_to_player?: boolean;
          status_effects?: string[];
          is_defeated?: boolean;
        };
        Update: Partial<{
          label: string;
          initiative: number;
          is_current: boolean;
          visible_to_player: boolean;
          status_effects: string[];
          is_defeated: boolean;
        }>;
        Relationships: Relationships;
      };
      dice_rolls: {
        Row: {
          id: string;
          campaign_id: string;
          user_id: string | null;
          label: string | null;
          expression: string;
          results: Json;
          total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          user_id: string;
          label?: string | null;
          expression: string;
          results?: Json;
          total: number;
        };
        Update: Record<string, never>;
        Relationships: Relationships;
      };
      catalog_entries: {
        Row: {
          id: string;
          owner_id: string;
          game_system_id: string;
          kind: 'item' | 'ability';
          name: string;
          category: string | null;
          cost: string | null;
          tier: string | null;
          description: string | null;
          default_quantity: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          game_system_id: string;
          kind: 'item' | 'ability';
          name: string;
          category?: string | null;
          cost?: string | null;
          tier?: string | null;
          description?: string | null;
          default_quantity?: number | null;
        };
        Update: Partial<{
          name: string;
          category: string | null;
          cost: string | null;
          tier: string | null;
          description: string | null;
          default_quantity: number | null;
        }>;
        Relationships: Relationships;
      };
      monster_templates: {
        Row: {
          id: string;
          owner_id: string;
          game_system_id: string;
          name: string;
          is_boss: boolean;
          sheet_data: SheetData;
          abilities: TemplateAbility[];
          items: TemplateItem[];
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          game_system_id: string;
          name: string;
          is_boss?: boolean;
          sheet_data?: SheetData;
          abilities?: TemplateAbility[];
          items?: TemplateItem[];
          notes?: string | null;
        };
        Update: Partial<{
          name: string;
          is_boss: boolean;
          sheet_data: SheetData;
          abilities: TemplateAbility[];
          items: TemplateItem[];
          notes: string | null;
          updated_at: string;
        }>;
        Relationships: Relationships;
      };
      handouts: {
        Row: {
          id: string;
          campaign_id: string;
          title: string;
          content: string | null;
          image_path: string | null;
          visible_to_player: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          title: string;
          content?: string | null;
          image_path?: string | null;
          visible_to_player?: boolean;
        };
        Update: Partial<{ title: string; content: string | null; image_path: string | null; visible_to_player: boolean }>;
        Relationships: Relationships;
      };
      maps: {
        Row: {
          id: string;
          campaign_id: string;
          name: string;
          kind: 'image' | 'tilemap';
          image_path: string | null;
          tile_data: TileMapData | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          name: string;
          kind?: 'image' | 'tilemap';
          image_path?: string | null;
          tile_data?: TileMapData | null;
          created_at?: string;
        };
        Update: Partial<{ name: string; image_path: string | null; tile_data: TileMapData | null }>;
        Relationships: Relationships;
      };
      map_tokens: {
        Row: {
          id: string;
          map_id: string;
          campaign_id: string;
          character_id: string | null;
          label: string;
          token_type: 'player' | 'npc' | 'enemy' | 'other';
          color: string | null;
          image_path: string | null;
          status_effects: string[];
          pos_x: number;
          pos_y: number;
          visible_to_player: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          map_id: string;
          campaign_id: string;
          character_id?: string | null;
          label: string;
          token_type?: 'player' | 'npc' | 'enemy' | 'other';
          color?: string | null;
          image_path?: string | null;
          status_effects?: string[];
          pos_x?: number;
          pos_y?: number;
          visible_to_player?: boolean;
        };
        Update: Partial<{
          label: string;
          token_type: 'player' | 'npc' | 'enemy' | 'other';
          color: string | null;
          image_path: string | null;
          status_effects: string[];
          pos_x: number;
          pos_y: number;
          visible_to_player: boolean;
        }>;
        Relationships: Relationships;
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_game_system: {
        Args: { p_name: string; p_schema: Json };
        Returns: Database['public']['Tables']['game_systems']['Row'];
      };
      update_game_system: {
        Args: { p_id: string; p_name: string; p_schema: Json };
        Returns: Database['public']['Tables']['game_systems']['Row'];
      };
      create_campaign: {
        Args: { p_name: string; p_game_system_id: string };
        Returns: Database['public']['Tables']['campaigns']['Row'];
      };
      join_campaign: {
        Args: { p_invite_code: string };
        Returns: Database['public']['Tables']['campaigns']['Row'];
      };
      is_campaign_gm: { Args: { p_campaign_id: string }; Returns: boolean };
      is_campaign_member: { Args: { p_campaign_id: string }; Returns: boolean };
    };
  };
}
