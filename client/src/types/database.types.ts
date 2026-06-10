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
      dispatch_threads: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          id: string
          job_id: string | null
          thread_type: string
          title: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string | null
          thread_type: string
          title: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string | null
          thread_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      dispatch_thread_participants: {
        Row: {
          employee_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          thread_id: string
        }
        Insert: {
          employee_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          thread_id: string
        }
        Update: {
          employee_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "dispatch_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          metadata: Json | null
          sender_id: string
          sender_name: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          metadata?: Json | null
          sender_id: string
          sender_name: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          sender_id?: string
          sender_name?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "dispatch_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_activations: {
        Row: {
          activated_at: string | null
          activation_key: string
          created_at: string
          created_by: string | null
          email_sent_to: string | null
          employee_id: string
          employee_name: string | null
          expires_at: string
          id: string
          pin_hash: string | null
          session_token: string | null
          status: string
        }
        Insert: {
          activated_at?: string | null
          activation_key: string
          created_at?: string
          created_by?: string | null
          email_sent_to?: string | null
          employee_id: string
          employee_name?: string | null
          expires_at: string
          id?: string
          pin_hash?: string | null
          session_token?: string | null
          status?: string
        }
        Update: {
          activated_at?: string | null
          activation_key?: string
          created_at?: string
          created_by?: string | null
          email_sent_to?: string | null
          employee_id?: string
          employee_name?: string | null
          expires_at?: string
          id?: string
          pin_hash?: string | null
          session_token?: string | null
          status?: string
        }
        Relationships: []
      }
      driver_sessions: {
        Row: {
          activation_id: string | null
          created_at: string
          display_name: string | null
          employee_id: string
          id: string
          is_online: boolean
          last_heading: number | null
          last_lat: number | null
          last_lng: number | null
          last_seen_at: string | null
          session_token: string | null
        }
        Insert: {
          activation_id?: string | null
          created_at?: string
          display_name?: string | null
          employee_id: string
          id?: string
          is_online?: boolean
          last_heading?: number | null
          last_lat?: number | null
          last_lng?: number | null
          last_seen_at?: string | null
          session_token?: string | null
        }
        Update: {
          activation_id?: string | null
          created_at?: string
          display_name?: string | null
          employee_id?: string
          id?: string
          is_online?: boolean
          last_heading?: number | null
          last_lat?: number | null
          last_lng?: number | null
          last_seen_at?: string | null
          session_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_sessions_activation_id_fkey"
            columns: ["activation_id"]
            isOneToOne: false
            referencedRelation: "driver_activations"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_location_history: {
        Row: {
          accuracy: number | null
          employee_id: string
          heading: number | null
          id: string
          lat: number
          lng: number
          recorded_at: string
          session_id: string | null
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          employee_id: string
          heading?: number | null
          id?: string
          lat: number
          lng: number
          recorded_at?: string
          session_id?: string | null
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          employee_id?: string
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string
          session_id?: string | null
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_location_history_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "driver_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_location_snapshots: {
        Row: {
          accuracy_meters: number | null
          captured_at: string
          created_at: string
          employee_profile_id: string | null
          id: string
          job_id: string | null
          latitude: number
          longitude: number
        }
        Insert: {
          accuracy_meters?: number | null
          captured_at?: string
          created_at?: string
          employee_profile_id?: string | null
          id?: string
          job_id?: string | null
          latitude: number
          longitude: number
        }
        Update: {
          accuracy_meters?: number | null
          captured_at?: string
          created_at?: string
          employee_profile_id?: string | null
          id?: string
          job_id?: string | null
          latitude?: number
          longitude?: number
        }
        Relationships: []
      }
      job_instruction_acknowledgements: {
        Row: {
          acknowledged_at: string
          acknowledged_by: string
          id: string
          job_id: string
        }
        Insert: {
          acknowledged_at?: string
          acknowledged_by: string
          id?: string
          job_id: string
        }
        Update: {
          acknowledged_at?: string
          acknowledged_by?: string
          id?: string
          job_id?: string
        }
        Relationships: []
      }
      employee_profiles: {
        Row: {
          auth_user_id: string | null
          created_at: string
          display_name: string
          email: string | null
          employee_id: string | null
          id: string
          phone: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          employee_id?: string | null
          id?: string
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          employee_id?: string | null
          id?: string
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      clients: {
        Row: {
          company: string | null
          created_at: string
          created_by: string | null
          data: Json
          email: string | null
          first_name: string | null
          id: string
          kind: string | null
          last_name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          data: Json
          email?: string | null
          first_name?: string | null
          id: string
          kind?: string | null
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json
          email?: string | null
          first_name?: string | null
          id?: string
          kind?: string | null
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          created_at: string
          created_by: string | null
          customer_name: string | null
          data: Json
          estimate_id: string | null
          id: string
          lead_source: string | null
          job_number: string | null
          payment_status: string | null
          priority: string
          quoted_amount: number | null
          scheduled_start: string | null
          service_type: string | null
          source: string | null
          status: string | null
          estimated_duration_minutes: number | null
          crew_sequence: number | null
          updated_at: string
        }
        Insert: {
          crew_sequence?: number | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          data: Json
          estimate_id?: string | null
          estimated_duration_minutes?: number | null
          id: string
          lead_source?: string | null
          job_number?: string | null
          payment_status?: string | null
          priority?: string
          quoted_amount?: number | null
          scheduled_start?: string | null
          service_type?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          crew_sequence?: number | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          data?: Json
          estimate_id?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          lead_source?: string | null
          job_number?: string | null
          payment_status?: string | null
          priority?: string
          quoted_amount?: number | null
          scheduled_start?: string | null
          service_type?: string | null
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
      job_activity: {
        Row: {
          created_at: string
          event_type: string
          id: string
          job_id: string
          message: string | null
          metadata: Json
          new_status: string | null
          previous_status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          job_id: string
          message?: string | null
          metadata?: Json
          new_status?: string | null
          previous_status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          job_id?: string
          message?: string | null
          metadata?: Json
          new_status?: string | null
          previous_status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      job_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          crew_sequence: number | null
          employee_profile_id: string
          id: string
          job_id: string
          role: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          crew_sequence?: number | null
          employee_profile_id: string
          id?: string
          job_id: string
          role?: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          crew_sequence?: number | null
          employee_profile_id?: string
          id?: string
          job_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_disposal_events: {
        Row: {
          arrived_at: string | null
          created_at: string
          created_by: string | null
          departed_at: string | null
          disposal_cost: number | null
          facility_address: string | null
          facility_id: string | null
          facility_name: string | null
          gross_weight_lbs: number | null
          id: string
          job_id: string
          material_type: string | null
          net_weight_lbs: number | null
          net_weight_tons: number | null
          notes: string | null
          planned: boolean
          receipt_number: string | null
          receipt_photo_id: string | null
          scale_ticket_number: string | null
          sequence_number: number
          status: string
          tare_weight_lbs: number | null
          unloading_completed_at: string | null
          unloading_started_at: string | null
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          created_at?: string
          created_by?: string | null
          departed_at?: string | null
          disposal_cost?: number | null
          facility_address?: string | null
          facility_id?: string | null
          facility_name?: string | null
          gross_weight_lbs?: number | null
          id?: string
          job_id: string
          material_type?: string | null
          net_weight_lbs?: number | null
          net_weight_tons?: number | null
          notes?: string | null
          planned?: boolean
          receipt_number?: string | null
          receipt_photo_id?: string | null
          scale_ticket_number?: string | null
          sequence_number?: number
          status?: string
          tare_weight_lbs?: number | null
          unloading_completed_at?: string | null
          unloading_started_at?: string | null
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          created_at?: string
          created_by?: string | null
          departed_at?: string | null
          disposal_cost?: number | null
          facility_address?: string | null
          facility_id?: string | null
          facility_name?: string | null
          gross_weight_lbs?: number | null
          id?: string
          job_id?: string
          material_type?: string | null
          net_weight_lbs?: number | null
          net_weight_tons?: number | null
          notes?: string | null
          planned?: boolean
          receipt_number?: string | null
          receipt_photo_id?: string | null
          scale_ticket_number?: string | null
          sequence_number?: number
          status?: string
          tare_weight_lbs?: number | null
          unloading_completed_at?: string | null
          unloading_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      job_issues: {
        Row: {
          added_scope_status: string | null
          customer_contact_attempted_at: string | null
          customer_contact_result: string | null
          created_at: string
          description: string
          dispatch_instructions: string | null
          dispatch_response: string | null
          driver_called_dispatch_at: string | null
          driver_released_at: string | null
          driver_released_by: string | null
          id: string
          issue_status: string
          issue_type: string
          job_id: string
          reported_by: string | null
          requires_dispatch_response: boolean
          resolution_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          stop_id: string | null
          updated_at: string
        }
        Insert: {
          added_scope_status?: string | null
          customer_contact_attempted_at?: string | null
          customer_contact_result?: string | null
          created_at?: string
          description: string
          dispatch_instructions?: string | null
          dispatch_response?: string | null
          driver_called_dispatch_at?: string | null
          driver_released_at?: string | null
          driver_released_by?: string | null
          id?: string
          issue_status?: string
          issue_type: string
          job_id: string
          reported_by?: string | null
          requires_dispatch_response?: boolean
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          stop_id?: string | null
          updated_at?: string
        }
        Update: {
          added_scope_status?: string | null
          customer_contact_attempted_at?: string | null
          customer_contact_result?: string | null
          created_at?: string
          description?: string
          dispatch_instructions?: string | null
          dispatch_response?: string | null
          driver_called_dispatch_at?: string | null
          driver_released_at?: string | null
          driver_released_by?: string | null
          id?: string
          issue_status?: string
          issue_type?: string
          job_id?: string
          reported_by?: string | null
          requires_dispatch_response?: boolean
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          stop_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      job_items: {
        Row: {
          category: string | null
          created_at: string
          destination_stop_id: string | null
          disassembly_required: boolean
          estimated_weight_lbs: number | null
          fragile: boolean
          heavy: boolean
          id: string
          instructions: string | null
          job_id: string
          name: string
          oversized: boolean
          quantity: number
          reassembly_required: boolean
          status: string
          stop_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          destination_stop_id?: string | null
          disassembly_required?: boolean
          estimated_weight_lbs?: number | null
          fragile?: boolean
          heavy?: boolean
          id?: string
          instructions?: string | null
          job_id: string
          name: string
          oversized?: boolean
          quantity?: number
          reassembly_required?: boolean
          status?: string
          stop_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          destination_stop_id?: string | null
          disassembly_required?: boolean
          estimated_weight_lbs?: number | null
          fragile?: boolean
          heavy?: boolean
          id?: string
          instructions?: string | null
          job_id?: string
          name?: string
          oversized?: boolean
          quantity?: number
          reassembly_required?: boolean
          status?: string
          stop_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      job_messages: {
        Row: {
          attachment_url: string | null
          created_at: string
          id: string
          job_id: string
          message: string
          read_at: string | null
          recipient_scope: string
          sender_id: string | null
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          job_id: string
          message: string
          read_at?: string | null
          recipient_scope?: string
          sender_id?: string | null
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          job_id?: string
          message?: string
          read_at?: string | null
          recipient_scope?: string
          sender_id?: string | null
        }
        Relationships: []
      }
      job_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          job_id: string
          photo_type: string
          stop_id: string | null
          storage_path: string
          uploaded_by: string | null
          visibility: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          job_id: string
          photo_type?: string
          stop_id?: string | null
          storage_path: string
          uploaded_by?: string | null
          visibility?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          job_id?: string
          photo_type?: string
          stop_id?: string | null
          storage_path?: string
          uploaded_by?: string | null
          visibility?: string
        }
        Relationships: []
      }
      job_stops: {
        Row: {
          address: string | null
          arrival_window_end: string | null
          arrival_window_start: string | null
          arrived_at: string | null
          city: string | null
          completed_at: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          instructions: string | null
          job_id: string
          latitude: number | null
          longitude: number | null
          name: string
          state: string | null
          status: string
          stop_order: number
          stop_type: string
          updated_at: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          arrival_window_end?: string | null
          arrival_window_start?: string | null
          arrived_at?: string | null
          city?: string | null
          completed_at?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          job_id: string
          latitude?: number | null
          longitude?: number | null
          name: string
          state?: string | null
          status?: string
          stop_order: number
          stop_type?: string
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          arrival_window_end?: string | null
          arrival_window_start?: string | null
          arrived_at?: string | null
          city?: string | null
          completed_at?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          job_id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          state?: string | null
          status?: string
          stop_order?: number
          stop_type?: string
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
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
      pricebook_categories: {
        Row: {
          created_at: string
          description: string
          id: string
          image_name: string | null
          mode: string | null
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id: string
          image_name?: string | null
          mode?: string | null
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          image_name?: string | null
          mode?: string | null
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      pricebook_items: {
        Row: {
          add_to_online_booking: boolean
          category_id: string | null
          cost: number
          created_at: string
          crew_size: number | null
          description: string
          id: string
          image_name: string | null
          item_type: string
          margin_decimal: number | null
          mode: string | null
          model_number: string | null
          name: string
          notes: string | null
          photo_required: boolean
          price: number
          price_note: string | null
          price_unit: string
          taxable: boolean
          updated_at: string
        }
        Insert: {
          add_to_online_booking?: boolean
          category_id?: string | null
          cost?: number
          created_at?: string
          crew_size?: number | null
          description?: string
          id: string
          image_name?: string | null
          item_type?: string
          margin_decimal?: number | null
          mode?: string | null
          model_number?: string | null
          name: string
          notes?: string | null
          photo_required?: boolean
          price?: number
          price_note?: string | null
          price_unit?: string
          taxable?: boolean
          updated_at?: string
        }
        Update: {
          add_to_online_booking?: boolean
          category_id?: string | null
          cost?: number
          created_at?: string
          crew_size?: number | null
          description?: string
          id?: string
          image_name?: string | null
          item_type?: string
          margin_decimal?: number | null
          mode?: string | null
          model_number?: string | null
          name?: string
          notes?: string | null
          photo_required?: boolean
          price?: number
          price_note?: string | null
          price_unit?: string
          taxable?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricebook_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pricebook_categories"
            referencedColumns: ["id"]
          },
        ]
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
      current_employee_profile_id: { Args: never; Returns: string }
      current_user_is_assigned_to_job: {
        Args: { target_job_id: string }
        Returns: boolean
      }
      get_driver_today: { Args: never; Returns: Json }
      driver_update_job_status: {
        Args: { target_job_id: string; next_status: string; note?: string | null }
        Returns: undefined
      }
      driver_confirm_dispatch_called: {
        Args: { target_issue_id: string }
        Returns: undefined
      }
      dispatch_resolve_job_issue: {
        Args: {
          target_issue_id: string
          next_issue_status: string
          resolution: string | null
          instructions: string | null
          response: string | null
          release_driver?: boolean
        }
        Returns: undefined
      }
      driver_update_disposal_event_status: {
        Args: { target_event_id: string; next_status: string; note?: string | null }
        Returns: undefined
      }
      is_manager: { Args: never; Returns: boolean }
      is_dispatch_user: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
