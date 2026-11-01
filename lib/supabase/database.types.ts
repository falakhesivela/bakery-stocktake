
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "batches": {
                  Row: {
                    "best_before": string | null,"code": string,"created_at": string,"created_by": string | null,"id": string,"item_id": string,"location_id": string | null,"produced_on": string,"source": Database["public"]['Enums']["batch_source"]
                  }
                  ComputedFields: never
                  Insert: {
                    "best_before"?: string | null,"code": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id": string,"location_id"?: string | null,"produced_on": string,"source": Database["public"]['Enums']["batch_source"]
                  }
                  Update: {
                    "best_before"?: string | null,"code"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id"?: string,"location_id"?: string | null,"produced_on"?: string,"source"?: Database["public"]['Enums']["batch_source"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "batches_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batches_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batches_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"goods_receipt_lines": {
                  Row: {
                    "batch_id": string | null,"best_before": string | null,"id": string,"item_id": string,"qty": number,"receipt_id": string,"supplier_batch": string | null,"unit_cost": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"best_before"?: string | null,"id"?: string,"item_id": string,"qty": number,"receipt_id": string,"supplier_batch"?: string | null,"unit_cost"?: number | null
                  }
                  Update: {
                    "batch_id"?: string | null,"best_before"?: string | null,"id"?: string,"item_id"?: string,"qty"?: number,"receipt_id"?: string,"supplier_batch"?: string | null,"unit_cost"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "goods_receipt_lines_batch_id_item_id_fkey"
      columns: ["batch_id","item_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","item_id"]
    },{
      foreignKeyName: "goods_receipt_lines_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goods_receipt_lines_receipt_id_fkey"
      columns: ["receipt_id"]
isOneToOne: false
      referencedRelation: "goods_receipts"
      referencedColumns: ["id"]
    }
                  ]
                },"goods_receipts": {
                  Row: {
                    "code": string,"created_at": string,"created_by": string | null,"id": string,"location_id": string,"note": string | null,"received_on": string,"reference": string | null,"supplier_id": string | null,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"location_id": string,"note"?: string | null,"received_on": string,"reference"?: string | null,"supplier_id"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"location_id"?: string,"note"?: string | null,"received_on"?: string,"reference"?: string | null,"supplier_id"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "goods_receipts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goods_receipts_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goods_receipts_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goods_receipts_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"item_barcodes": {
                  Row: {
                    "barcode": string,"created_at": string,"item_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "barcode": string,"created_at"?: string,"item_id": string
                  }
                  Update: {
                    "barcode"?: string,"created_at"?: string,"item_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_barcodes_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"item_location_settings": {
                  Row: {
                    "item_id": string,"location_id": string,"par_level": number | null,"reorder_level": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "item_id": string,"location_id": string,"par_level"?: number | null,"reorder_level"?: number | null
                  }
                  Update: {
                    "item_id"?: string,"location_id"?: string,"par_level"?: number | null,"reorder_level"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_location_settings_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_location_settings_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"items": {
                  Row: {
                    "active": boolean,"category_id": string | null,"cost": number | null,"created_at": string,"id": string,"image_path": string | null,"kind": Database["public"]['Enums']["item_kind"],"name": string,"notes": string | null,"price": number | null,"shelf_life_days": number | null,"sku": string,"track_batches": boolean,"unit": Database["public"]['Enums']["item_unit"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"category_id"?: string | null,"cost"?: number | null,"created_at"?: string,"id"?: string,"image_path"?: string | null,"kind"?: Database["public"]['Enums']["item_kind"],"name": string,"notes"?: string | null,"price"?: number | null,"shelf_life_days"?: number | null,"sku": string,"track_batches"?: boolean,"unit"?: Database["public"]['Enums']["item_unit"],"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"category_id"?: string | null,"cost"?: number | null,"created_at"?: string,"id"?: string,"image_path"?: string | null,"kind"?: Database["public"]['Enums']["item_kind"],"name"?: string,"notes"?: string | null,"price"?: number | null,"shelf_life_days"?: number | null,"sku"?: string,"track_batches"?: boolean,"unit"?: Database["public"]['Enums']["item_unit"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"locations": {
                  Row: {
                    "active": boolean,"address": string | null,"can_produce": boolean,"code": string,"created_at": string,"id": string,"name": string,"phone": string | null,"timezone": string,"type": Database["public"]['Enums']["location_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"address"?: string | null,"can_produce"?: boolean,"code": string,"created_at"?: string,"id"?: string,"name": string,"phone"?: string | null,"timezone"?: string,"type": Database["public"]['Enums']["location_type"],"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"address"?: string | null,"can_produce"?: boolean,"code"?: string,"created_at"?: string,"id"?: string,"name"?: string,"phone"?: string | null,"timezone"?: string,"type"?: Database["public"]['Enums']["location_type"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"production_runs": {
                  Row: {
                    "batch_id": string | null,"created_at": string,"created_by": string | null,"id": string,"item_id": string,"location_id": string,"note": string | null,"produced_on": string,"qty": number,"used_recipe": boolean,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id": string,"location_id": string,"note"?: string | null,"produced_on": string,"qty": number,"used_recipe"?: boolean,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "batch_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id"?: string,"location_id"?: string,"note"?: string | null,"produced_on"?: string,"qty"?: number,"used_recipe"?: boolean,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "production_runs_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_runs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_runs_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_runs_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_runs_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"created_at": string,"email": string | null,"full_name": string,"id": string,"is_admin": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"email"?: string | null,"full_name"?: string,"id": string,"is_admin"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"is_admin"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recipe_lines": {
                  Row: {
                    "id": string,"ingredient_item_id": string,"qty": number,"recipe_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"ingredient_item_id": string,"qty": number,"recipe_id": string
                  }
                  Update: {
                    "id"?: string,"ingredient_item_id"?: string,"qty"?: number,"recipe_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_lines_ingredient_item_id_fkey"
      columns: ["ingredient_item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_lines_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipe_costs"
      referencedColumns: ["recipe_id"]
    },{
      foreignKeyName: "recipe_lines_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"recipes": {
                  Row: {
                    "created_at": string,"id": string,"notes": string | null,"product_item_id": string,"updated_at": string,"updated_by": string | null,"yield_qty": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"notes"?: string | null,"product_item_id": string,"updated_at"?: string,"updated_by"?: string | null,"yield_qty": number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"notes"?: string | null,"product_item_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"yield_qty"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipes_product_item_id_fkey"
      columns: ["product_item_id"]
isOneToOne: true
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipes_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"sales_days": {
                  Row: {
                    "business_date": string,"created_at": string,"created_by": string | null,"id": string,"location_id": string,"note": string | null,"posted_at": string | null,"posted_by": string | null,"status": Database["public"]['Enums']["sales_status"],"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_date": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"location_id": string,"note"?: string | null,"posted_at"?: string | null,"posted_by"?: string | null,"status"?: Database["public"]['Enums']["sales_status"],"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "business_date"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"location_id"?: string,"note"?: string | null,"posted_at"?: string | null,"posted_by"?: string | null,"status"?: Database["public"]['Enums']["sales_status"],"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_days_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_days_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_days_posted_by_fkey"
      columns: ["posted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_days_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"sales_lines": {
                  Row: {
                    "id": string,"item_id": string,"qty": number,"sales_day_id": string,"unit_price": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"item_id": string,"qty": number,"sales_day_id": string,"unit_price"?: number | null
                  }
                  Update: {
                    "id"?: string,"item_id"?: string,"qty"?: number,"sales_day_id"?: string,"unit_price"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_lines_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_lines_sales_day_id_fkey"
      columns: ["sales_day_id"]
isOneToOne: false
      referencedRelation: "sales_days"
      referencedColumns: ["id"]
    }
                  ]
                },"standing_orders": {
                  Row: {
                    "from_location_id": string,"item_id": string,"qty": number,"to_location_id": string,"updated_at": string,"updated_by": string | null,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "from_location_id": string,"item_id": string,"qty": number,"to_location_id": string,"updated_at"?: string,"updated_by"?: string | null,"weekday": number
                  }
                  Update: {
                    "from_location_id"?: string,"item_id"?: string,"qty"?: number,"to_location_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "standing_orders_from_location_id_fkey"
      columns: ["from_location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "standing_orders_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "standing_orders_to_location_id_fkey"
      columns: ["to_location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "standing_orders_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_levels": {
                  Row: {
                    "batch_id": string | null,"id": number,"item_id": string,"location_id": string,"qty": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"id"?: never,"item_id": string,"location_id": string,"qty"?: number,"updated_at"?: string
                  }
                  Update: {
                    "batch_id"?: string | null,"id"?: never,"item_id"?: string,"location_id"?: string,"qty"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_levels_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_levels_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_levels_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_movements": {
                  Row: {
                    "batch_id": string | null,"business_date": string,"created_at": string,"created_by": string | null,"id": number,"item_id": string,"location_id": string,"note": string | null,"qty": number,"reference_id": string | null,"reference_type": string | null,"type": Database["public"]['Enums']["movement_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"business_date": string,"created_at"?: string,"created_by"?: string | null,"id"?: never,"item_id": string,"location_id": string,"note"?: string | null,"qty": number,"reference_id"?: string | null,"reference_type"?: string | null,"type": Database["public"]['Enums']["movement_type"]
                  }
                  Update: {
                    "batch_id"?: string | null,"business_date"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: never,"item_id"?: string,"location_id"?: string,"note"?: string | null,"qty"?: number,"reference_id"?: string | null,"reference_type"?: string | null,"type"?: Database["public"]['Enums']["movement_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_batch_id_item_id_fkey"
      columns: ["batch_id","item_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","item_id"]
    },{
      foreignKeyName: "stock_movements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_take_lines": {
                  Row: {
                    "added_during_count": boolean,"batch_id": string | null,"counted_at": string | null,"counted_by": string | null,"counted_qty": number | null,"expected_qty": number | null,"id": string,"item_id": string,"stock_take_id": string,"unit_cost": number | null,"variance": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_during_count"?: boolean,"batch_id"?: string | null,"counted_at"?: string | null,"counted_by"?: string | null,"counted_qty"?: number | null,"expected_qty"?: number | null,"id"?: string,"item_id": string,"stock_take_id": string,"unit_cost"?: number | null,"variance"?: number | null
                  }
                  Update: {
                    "added_during_count"?: boolean,"batch_id"?: string | null,"counted_at"?: string | null,"counted_by"?: string | null,"counted_qty"?: number | null,"expected_qty"?: number | null,"id"?: string,"item_id"?: string,"stock_take_id"?: string,"unit_cost"?: number | null,"variance"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_take_lines_batch_id_item_id_fkey"
      columns: ["batch_id","item_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","item_id"]
    },{
      foreignKeyName: "stock_take_lines_counted_by_fkey"
      columns: ["counted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_take_lines_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_take_lines_stock_take_id_fkey"
      columns: ["stock_take_id"]
isOneToOne: false
      referencedRelation: "stock_takes"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_takes": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"blind": boolean,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"category_ids": (string)[],"code": string,"count_date": string,"created_at": string,"created_by": string | null,"id": string,"location_id": string,"note": string | null,"scope": Database["public"]['Enums']["stock_take_scope"],"status": Database["public"]['Enums']["stock_take_status"],"submitted_at": string | null,"submitted_by": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"blind"?: boolean,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"category_ids"?: (string)[],"code"?: string,"count_date": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"location_id": string,"note"?: string | null,"scope": Database["public"]['Enums']["stock_take_scope"],"status"?: Database["public"]['Enums']["stock_take_status"],"submitted_at"?: string | null,"submitted_by"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"blind"?: boolean,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"category_ids"?: (string)[],"code"?: string,"count_date"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"location_id"?: string,"note"?: string | null,"scope"?: Database["public"]['Enums']["stock_take_scope"],"status"?: Database["public"]['Enums']["stock_take_status"],"submitted_at"?: string | null,"submitted_by"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_takes_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_takes_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_takes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_takes_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_takes_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "active": boolean,"contact_name": string | null,"created_at": string,"email": string | null,"id": string,"name": string,"notes": string | null,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"contact_name"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"contact_name"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"transfer_events": {
                  Row: {
                    "action": string,"created_at": string,"created_by": string | null,"id": number,"note": string | null,"status": Database["public"]['Enums']["transfer_status"],"transfer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"created_by"?: string | null,"id"?: never,"note"?: string | null,"status": Database["public"]['Enums']["transfer_status"],"transfer_id": string
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: never,"note"?: string | null,"status"?: Database["public"]['Enums']["transfer_status"],"transfer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transfer_events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_events_transfer_id_fkey"
      columns: ["transfer_id"]
isOneToOne: false
      referencedRelation: "transfer_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_events_transfer_id_fkey"
      columns: ["transfer_id"]
isOneToOne: false
      referencedRelation: "transfers"
      referencedColumns: ["id"]
    }
                  ]
                },"transfer_line_batches": {
                  Row: {
                    "batch_id": string | null,"discrepancy_note": string | null,"discrepancy_reason": Database["public"]['Enums']["discrepancy_reason"] | null,"dispatched_qty": number,"id": number,"item_id": string,"line_id": string,"received_qty": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"discrepancy_note"?: string | null,"discrepancy_reason"?: Database["public"]['Enums']["discrepancy_reason"] | null,"dispatched_qty": number,"id"?: never,"item_id": string,"line_id": string,"received_qty"?: number | null
                  }
                  Update: {
                    "batch_id"?: string | null,"discrepancy_note"?: string | null,"discrepancy_reason"?: Database["public"]['Enums']["discrepancy_reason"] | null,"dispatched_qty"?: number,"id"?: never,"item_id"?: string,"line_id"?: string,"received_qty"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "transfer_line_batches_batch_id_item_id_fkey"
      columns: ["batch_id","item_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","item_id"]
    },{
      foreignKeyName: "transfer_line_batches_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_line_batches_line_id_fkey"
      columns: ["line_id"]
isOneToOne: false
      referencedRelation: "transfer_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"transfer_lines": {
                  Row: {
                    "dispatched_qty": number | null,"id": string,"item_id": string,"note": string | null,"qty": number,"received_qty": number | null,"requested_qty": number | null,"transfer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "dispatched_qty"?: number | null,"id"?: string,"item_id": string,"note"?: string | null,"qty": number,"received_qty"?: number | null,"requested_qty"?: number | null,"transfer_id": string
                  }
                  Update: {
                    "dispatched_qty"?: number | null,"id"?: string,"item_id"?: string,"note"?: string | null,"qty"?: number,"received_qty"?: number | null,"requested_qty"?: number | null,"transfer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transfer_lines_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_lines_transfer_id_fkey"
      columns: ["transfer_id"]
isOneToOne: false
      referencedRelation: "transfer_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_lines_transfer_id_fkey"
      columns: ["transfer_id"]
isOneToOne: false
      referencedRelation: "transfers"
      referencedColumns: ["id"]
    }
                  ]
                },"transfers": {
                  Row: {
                    "code": string,"created_at": string,"created_by": string | null,"dispatched_at": string | null,"from_location_id": string,"has_discrepancy": boolean,"id": string,"needed_on": string | null,"note": string | null,"origin": Database["public"]['Enums']["transfer_origin"],"received_at": string | null,"status": Database["public"]['Enums']["transfer_status"],"to_location_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code"?: string,"created_at"?: string,"created_by"?: string | null,"dispatched_at"?: string | null,"from_location_id": string,"has_discrepancy"?: boolean,"id"?: string,"needed_on"?: string | null,"note"?: string | null,"origin": Database["public"]['Enums']["transfer_origin"],"received_at"?: string | null,"status"?: Database["public"]['Enums']["transfer_status"],"to_location_id": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"created_by"?: string | null,"dispatched_at"?: string | null,"from_location_id"?: string,"has_discrepancy"?: boolean,"id"?: string,"needed_on"?: string | null,"note"?: string | null,"origin"?: Database["public"]['Enums']["transfer_origin"],"received_at"?: string | null,"status"?: Database["public"]['Enums']["transfer_status"],"to_location_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transfers_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfers_from_location_id_fkey"
      columns: ["from_location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfers_to_location_id_fkey"
      columns: ["to_location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"user_locations": {
                  Row: {
                    "created_at": string,"location_id": string,"role": Database["public"]['Enums']["location_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"location_id": string,"role": Database["public"]['Enums']["location_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"location_id"?: string,"role"?: Database["public"]['Enums']["location_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_locations_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_locations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"waste_entries": {
                  Row: {
                    "batch_id": string | null,"business_date": string,"created_at": string,"created_by": string | null,"id": string,"item_id": string,"location_id": string,"note": string | null,"photo_path": string | null,"qty": number,"reason": Database["public"]['Enums']["waste_reason"],"unit_cost": number | null,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"business_date": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id": string,"location_id": string,"note"?: string | null,"photo_path"?: string | null,"qty": number,"reason": Database["public"]['Enums']["waste_reason"],"unit_cost"?: number | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "batch_id"?: string | null,"business_date"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id"?: string,"location_id"?: string,"note"?: string | null,"photo_path"?: string | null,"qty"?: number,"reason"?: Database["public"]['Enums']["waste_reason"],"unit_cost"?: number | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "waste_entries_batch_id_item_id_fkey"
      columns: ["batch_id","item_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","item_id"]
    },{
      foreignKeyName: "waste_entries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waste_entries_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waste_entries_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waste_entries_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "low_stock": {
                  Row: {
                    "item_id": string,"item_name": string,"location_code": string,"location_id": string,"location_name": string,"par_level": number | null,"qty": number | null,"reorder_level": number | null,"sku": string,"unit": Database["public"]['Enums']["item_unit"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "item_location_settings_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_location_settings_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_costs": {
                  Row: {
                    "batch_cost": number | null,"line_count": number | null,"lines_without_cost": number | null,"product_item_id": string,"recipe_id": string,"unit_cost": number | null,"yield_qty": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "recipes_product_item_id_fkey"
      columns: ["product_item_id"]
isOneToOne: true
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_by_item": {
                  Row: {
                    "batch_count": number | null,"category_name": string | null,"days_to_earliest_expiry": number | null,"earliest_best_before": string | null,"item_id": string,"item_name": string,"kind": Database["public"]['Enums']["item_kind"],"location_code": string,"location_id": string,"location_name": string,"qty": number | null,"sku": string,"unit": Database["public"]['Enums']["item_unit"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "stock_levels_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_levels_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_on_hand": {
                  Row: {
                    "batch_code": string | null,"batch_id": string | null,"best_before": string | null,"category_name": string | null,"days_to_expiry": number | null,"id": number,"item_id": string,"item_name": string,"kind": Database["public"]['Enums']["item_kind"],"location_code": string,"location_id": string,"location_name": string,"produced_on": string | null,"qty": number,"sku": string,"unit": Database["public"]['Enums']["item_unit"],"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "stock_levels_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_levels_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_levels_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"transfer_list": {
                  Row: {
                    "code": string,"created_at": string,"dispatched_at": string | null,"from_code": string,"from_location_id": string,"from_name": string,"from_type": Database["public"]['Enums']["location_type"],"has_discrepancy": boolean,"id": string,"line_count": number | null,"needed_on": string | null,"note": string | null,"origin": Database["public"]['Enums']["transfer_origin"],"overdue": boolean | null,"received_at": string | null,"status": Database["public"]['Enums']["transfer_status"],"to_code": string,"to_location_id": string,"to_name": string,"to_type": Database["public"]['Enums']["location_type"],"total_qty": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "transfers_from_location_id_fkey"
      columns: ["from_location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfers_to_location_id_fkey"
      columns: ["to_location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "add_stock_take_count":
{ Args: { "p_code": string,"p_delta"?: number,"p_stock_take_id": string }; Returns: {
              "batch_code": string,"counted_qty": number,"item_name": string,"line_id": string
            }[]
                           },
"add_stock_take_line":
{ Args: { "p_batch_id"?: string,"p_item_id": string,"p_stock_take_id": string }; Returns: string
                           },
"approve_stock_take":
{ Args: { "p_id": string }; Returns: number
                           },
"approve_transfer":
{ Args: { "p_id": string,"p_lines"?: Json }; Returns: undefined
                           },
"can_edit_recipes":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"can_edit_transfer":
{ Args: { "p_from": string,"p_origin": Database["public"]['Enums']["transfer_origin"],"p_status": Database["public"]['Enums']["transfer_status"],"p_to": string }; Returns: boolean
                           },
"can_manage_location":
{ Args: { "p_location_id": string }; Returns: boolean
                           },
"can_see_transfer":
{ Args: { "p_transfer_id": string }; Returns: boolean
                           },
"can_work_location":
{ Args: { "p_location_id": string }; Returns: boolean
                           },
"cancel_stock_take":
{ Args: { "p_id": string,"p_reason"?: string }; Returns: undefined
                           },
"cancel_transfer":
{ Args: { "p_id": string,"p_reason"?: string }; Returns: string
                           },
"daily_summary":
{ Args: { "p_date": string,"p_location_id": string }; Returns: {
              "closing": number,"count_difference": number,"counted": boolean,"expected_closing": number,"item_id": string,"item_name": string,"kind": Database["public"]['Enums']["item_kind"],"opening": number,"other": number,"produced": number,"received": number,"sent": number,"sku": string,"sold": number,"unit": Database["public"]['Enums']["item_unit"],"unit_cost": number,"unit_price": number,"wasted": number
            }[]
                           },
"dispatch_transfer":
{ Args: { "p_id": string,"p_picks": Json }; Returns: undefined
                           },
"find_by_code":
{ Args: { "p_code": string }; Returns: {
              "batch_id": string,"item_id": string
            }[]
                           },
"generate_standing_transfers":
{ Args: { "p_date"?: string }; Returns: number
                           },
"has_location_access":
{ Args: { "p_location_id": string }; Returns: boolean
                           },
"import_items":
{ Args: { "p_rows": Json }; Returns: Json
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_any_manager":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"location_today":
{ Args: { "p_location_id": string }; Returns: string
                           },
"lock_counting_stock_take":
{ Args: { "p_id": string }; Returns: {
              "approved_at": string | null,
"approved_by": string | null,
"blind": boolean,
"cancel_reason": string | null,
"cancelled_at": string | null,
"cancelled_by": string | null,
"category_ids": (string)[],
"code": string,
"count_date": string,
"created_at": string,
"created_by": string | null,
"id": string,
"location_id": string,
"note": string | null,
"scope": Database["public"]['Enums']["stock_take_scope"],
"status": Database["public"]['Enums']["stock_take_status"],
"submitted_at": string | null,
"submitted_by": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "stock_takes"
        isOneToOne: true
        isSetofReturn: false
      } },
"log_production":
{ Args: { "p_best_before"?: string,"p_item_id": string,"p_location_id": string,"p_note"?: string,"p_produced_on"?: string,"p_qty": number,"p_use_recipe"?: boolean }; Returns: {
              "batch_code": string,"batch_id": string,"ingredients_used": number,"run_id": string
            }[]
                           },
"log_transfer_event":
{ Args: { "p_action": string,"p_note"?: string,"p_transfer_id": string }; Returns: undefined
                           },
"log_waste":
{ Args: { "p_business_date"?: string,"p_lines": Json,"p_location_id": string }; Returns: number
                           },
"next_goods_receipt_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"next_stock_take_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"next_transfer_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"photo_location":
{ Args: { "p_name": string }; Returns: string
                           },
"post_opening_stock":
{ Args: { "p_lines": Json,"p_location_id": string,"p_note"?: string }; Returns: number
                           },
"production_ingredient_needs":
{ Args: { "p_date": string,"p_location_id": string }; Returns: {
              "in_stock": number,"item_id": string,"item_name": string,"needed": number,"short": number,"sku": string,"unit": Database["public"]['Enums']["item_unit"]
            }[]
                           },
"production_plan":
{ Args: { "p_date": string,"p_location_id": string }; Returns: {
              "item_id": string,"item_name": string,"needed": number,"sku": string,"to_make": number,"unit": Database["public"]['Enums']["item_unit"],"usable_stock": number
            }[]
                           },
"receive_goods":
{ Args: { "p_lines": Json,"p_location_id": string,"p_note"?: string,"p_received_on"?: string,"p_reference"?: string,"p_supplier_id"?: string,"p_update_costs"?: boolean }; Returns: string
                           },
"receive_transfer":
{ Args: { "p_id": string,"p_lines": Json }; Returns: undefined
                           },
"reject_transfer":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"reopen_sales_day":
{ Args: { "p_id": string,"p_reason"?: string }; Returns: undefined
                           },
"replace_transfer_lines":
{ Args: { "p_keep_requested": boolean,"p_lines": Json,"p_transfer_id": string }; Returns: undefined
                           },
"return_stock_take":
{ Args: { "p_id": string }; Returns: undefined
                           },
"save_item":
{ Args: { "p_barcodes": (string)[],"p_id"?: string,"p_item": Json }; Returns: string
                           },
"save_recipe":
{ Args: { "p_lines": Json,"p_notes"?: string,"p_product_item_id": string,"p_yield": number }; Returns: string
                           },
"save_sales_day":
{ Args: { "p_business_date": string,"p_lines": Json,"p_location_id": string,"p_note"?: string,"p_post"?: boolean }; Returns: string
                           },
"save_standing_orders":
{ Args: { "p_from": string,"p_rows": Json,"p_to": string }; Returns: number
                           },
"save_transfer":
{ Args: { "p_id"?: string,"p_lines": Json,"p_transfer": Json }; Returns: string
                           },
"set_stock_take_count":
{ Args: { "p_counted": number,"p_line_id": string }; Returns: undefined
                           },
"start_picking":
{ Args: { "p_id": string }; Returns: undefined
                           },
"start_stock_take":
{ Args: { "p_blind"?: boolean,"p_category_ids"?: (string)[],"p_count_date": string,"p_location_id": string,"p_note"?: string,"p_scope": Database["public"]['Enums']["stock_take_scope"] }; Returns: string
                           },
"stock_take_covers":
{ Args: { "p_category_id": string,"p_category_ids": (string)[],"p_kind": Database["public"]['Enums']["item_kind"],"p_scope": Database["public"]['Enums']["stock_take_scope"] }; Returns: boolean
                           },
"stock_take_review":
{ Args: { "p_id": string }; Returns: {
              "added_during_count": boolean,"batch_code": string,"batch_id": string,"best_before": string,"category_name": string,"counted_at": string,"counted_by_name": string,"counted_qty": number,"expected_qty": number,"item_id": string,"item_name": string,"kind": Database["public"]['Enums']["item_kind"],"line_id": string,"sku": string,"track_batches": boolean,"unit": Database["public"]['Enums']["item_unit"],"unit_cost": number,"variance": number
            }[]
                           },
"submit_stock_take":
{ Args: { "p_id": string }; Returns: undefined
                           },
"submit_transfer":
{ Args: { "p_id": string }; Returns: Database["public"]['Enums']["transfer_status"]
                           },
"take_stock_fefo":
{ Args: { "p_business_date": string,"p_expired_first"?: boolean,"p_item_id": string,"p_location_id": string,"p_note"?: string,"p_qty": number,"p_reference_id": string,"p_reference_type": string,"p_type": Database["public"]['Enums']["movement_type"] }; Returns: undefined
                           },
"void_goods_receipt":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"void_production_run":
{ Args: { "p_reason": string,"p_run_id": string }; Returns: undefined
                           },
"void_waste_entry":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           }
          }
          Enums: {
            "batch_source": "opening"|"production"|"purchase","discrepancy_reason": "missing"|"damaged"|"extra"|"other","item_kind": "product"|"ingredient"|"packaging","item_unit": "each"|"g"|"kg"|"ml"|"l","location_role": "warehouse_manager"|"warehouse_staff"|"store_manager"|"store_staff"|"driver","location_type": "warehouse"|"store","movement_type": "opening_balance"|"production_in"|"ingredient_use"|"purchase_in"|"transfer_out"|"transfer_in"|"transfer_loss"|"sale"|"waste"|"count_adjustment"|"order_fulfilled"|"manual_adjustment","sales_status": "draft"|"posted","stock_take_scope": "products"|"all"|"categories","stock_take_status": "counting"|"submitted"|"approved"|"cancelled","transfer_origin": "request"|"push"|"standing_order","transfer_status": "draft"|"requested"|"approved"|"picking"|"in_transit"|"received"|"rejected"|"cancelled","waste_reason": "expired"|"damaged"|"unsold"|"quality"|"staff_sample"|"other"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "batch_source": ["opening", "production", "purchase"],"discrepancy_reason": ["missing", "damaged", "extra", "other"],"item_kind": ["product", "ingredient", "packaging"],"item_unit": ["each", "g", "kg", "ml", "l"],"location_role": ["warehouse_manager", "warehouse_staff", "store_manager", "store_staff", "driver"],"location_type": ["warehouse", "store"],"movement_type": ["opening_balance", "production_in", "ingredient_use", "purchase_in", "transfer_out", "transfer_in", "transfer_loss", "sale", "waste", "count_adjustment", "order_fulfilled", "manual_adjustment"],"sales_status": ["draft", "posted"],"stock_take_scope": ["products", "all", "categories"],"stock_take_status": ["counting", "submitted", "approved", "cancelled"],"transfer_origin": ["request", "push", "standing_order"],"transfer_status": ["draft", "requested", "approved", "picking", "in_transit", "received", "rejected", "cancelled"],"waste_reason": ["expired", "damaged", "unsold", "quality", "staff_sample", "other"]
          }
        }
} as const
