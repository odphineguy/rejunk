export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      customers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facilities: {
        Row: {
          accepted_materials: string[]
          address: string | null
          best_use_case: string | null
          city: string | null
          created_at: string
          default_rate: number
          environmental_fee: number
          extra_fees: number
          facility_name: string
          facility_type: string
          fuel_surcharge: number
          hours: string[]
          id: string
          is_active: boolean
          is_default: boolean
          last_verified_date: string | null
          latitude: number | null
          longitude: number | null
          minimum_charge: number
          notes: string | null
          phone: string | null
          price_type: string
          pricing_impact_label: string | null
          rejected_materials: string[]
          state: string | null
          updated_at: string
          website: string | null
          zip: string | null
        }
        Insert: {
          accepted_materials?: string[]
          address?: string | null
          best_use_case?: string | null
          city?: string | null
          created_at?: string
          default_rate?: number
          environmental_fee?: number
          extra_fees?: number
          facility_name: string
          facility_type: string
          fuel_surcharge?: number
          hours?: string[]
          id: string
          is_active?: boolean
          is_default?: boolean
          last_verified_date?: string | null
          latitude?: number | null
          longitude?: number | null
          minimum_charge?: number
          notes?: string | null
          phone?: string | null
          price_type: string
          pricing_impact_label?: string | null
          rejected_materials?: string[]
          state?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Update: {
          accepted_materials?: string[]
          address?: string | null
          best_use_case?: string | null
          city?: string | null
          created_at?: string
          default_rate?: number
          environmental_fee?: number
          extra_fees?: number
          facility_name?: string
          facility_type?: string
          fuel_surcharge?: number
          hours?: string[]
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_verified_date?: string | null
          latitude?: number | null
          longitude?: number | null
          minimum_charge?: number
          notes?: string | null
          phone?: string | null
          price_type?: string
          pricing_impact_label?: string | null
          rejected_materials?: string[]
          state?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      jobs: {
        Row: {
          created_at: string
          created_by: string | null
          customer_name: string | null
          data: Json
          estimate_id: string | null
          id: string
          job_number: string | null
          payment_status: string | null
          quoted_amount: number | null
          scheduled_start: string | null
          source: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          data: Json
          estimate_id?: string | null
          id: string
          job_number?: string | null
          payment_status?: string | null
          quoted_amount?: number | null
          scheduled_start?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          data?: Json
          estimate_id?: string | null
          id?: string
          job_number?: string | null
          payment_status?: string | null
          quoted_amount?: number | null
          scheduled_start?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      material_pricing_rules: {
        Row: {
          created_at: string
          default_density_lbs_per_yard: number
          density_range_max: number | null
          density_range_min: number | null
          disposal_difficulty_multiplier: number
          id: string
          is_active: boolean
          labor_difficulty_multiplier: number
          material_category: string
          material_name: string
          notes: string | null
          preferred_facility_types: string[]
          pricing_mode: string
          requires_weight_override: boolean
          updated_at: string
          warning_text: string | null
        }
        Insert: {
          created_at?: string
          default_density_lbs_per_yard?: number
          density_range_max?: number | null
          density_range_min?: number | null
          disposal_difficulty_multiplier?: number
          id: string
          is_active?: boolean
          labor_difficulty_multiplier?: number
          material_category: string
          material_name: string
          notes?: string | null
          preferred_facility_types?: string[]
          pricing_mode: string
          requires_weight_override?: boolean
          updated_at?: string
          warning_text?: string | null
        }
        Update: {
          created_at?: string
          default_density_lbs_per_yard?: number
          density_range_max?: number | null
          density_range_min?: number | null
          disposal_difficulty_multiplier?: number
          id?: string
          is_active?: boolean
          labor_difficulty_multiplier?: number
          material_category?: string
          material_name?: string
          notes?: string | null
          preferred_facility_types?: string[]
          pricing_mode?: string
          requires_weight_override?: boolean
          updated_at?: string
          warning_text?: string | null
        }
        Relationships: []
      }
      pricing_defaults: {
        Row: {
          default_facility_rate_per_ton: number
          estimated_hours: number
          fuel_price_per_gallon: number
          hourly_labor_cost: number
          id: number
          minimum_profit_dollars: number
          target_margin_decimal: number
          updated_at: string
          workers: number
        }
        Insert: {
          default_facility_rate_per_ton?: number
          estimated_hours?: number
          fuel_price_per_gallon?: number
          hourly_labor_cost?: number
          id?: number
          minimum_profit_dollars?: number
          target_margin_decimal?: number
          updated_at?: string
          workers?: number
        }
        Update: {
          default_facility_rate_per_ton?: number
          estimated_hours?: number
          fuel_price_per_gallon?: number
          hourly_labor_cost?: number
          id?: number
          minimum_profit_dollars?: number
          target_margin_decimal?: number
          updated_at?: string
          workers?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      saved_estimates: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          data: Json
          facility_id: string | null
          final_quote: number | null
          id: string
          job_address: string | null
          material_type: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          data: Json
          facility_id?: string | null
          final_quote?: number | null
          id?: string
          job_address?: string | null
          material_type?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          data?: Json
          facility_id?: string | null
          final_quote?: number | null
          id?: string
          job_address?: string | null
          material_type?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_estimates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_estimates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string
          empty_weight_lbs: number | null
          fuel_type: string | null
          gvwr_lbs: number | null
          has_dump_capability: boolean
          has_liftgate: boolean
          hourly_vehicle_cost: number | null
          id: string
          is_active: boolean
          is_default: boolean
          max_payload_lbs: number
          mileage_cost: number | null
          mpg_loaded: number | null
          mpg_unloaded: number | null
          notes: string | null
          requires_tow_vehicle: boolean
          updated_at: string
          usable_cubic_yards: number
          vehicle_name: string
          vehicle_type: string
        }
        Insert: {
          created_at?: string
          empty_weight_lbs?: number | null
          fuel_type?: string | null
          gvwr_lbs?: number | null
          has_dump_capability?: boolean
          has_liftgate?: boolean
          hourly_vehicle_cost?: number | null
          id: string
          is_active?: boolean
          is_default?: boolean
          max_payload_lbs?: number
          mileage_cost?: number | null
          mpg_loaded?: number | null
          mpg_unloaded?: number | null
          notes?: string | null
          requires_tow_vehicle?: boolean
          updated_at?: string
          usable_cubic_yards?: number
          vehicle_name: string
          vehicle_type: string
        }
        Update: {
          created_at?: string
          empty_weight_lbs?: number | null
          fuel_type?: string | null
          gvwr_lbs?: number | null
          has_dump_capability?: boolean
          has_liftgate?: boolean
          hourly_vehicle_cost?: number | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          max_payload_lbs?: number
          mileage_cost?: number | null
          mpg_loaded?: number | null
          mpg_unloaded?: number | null
          notes?: string | null
          requires_tow_vehicle?: boolean
          updated_at?: string
          usable_cubic_yards?: number
          vehicle_name?: string
          vehicle_type?: string
        }
        Relationships: []
      }
      volume_benchmarks: {
        Row: {
          created_at: string
          fraction: number
          id: string
          label: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fraction: number
          id: string
          label: string
          price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fraction?: number
          id?: string
          label?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_manager: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
