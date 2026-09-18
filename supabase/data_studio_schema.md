## Table `data_studio_manufacturers`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `production_manufacturer_id` | `uuid` |  Nullable |
| `name` | `text` |  |
| `slug` | `text` |  Unique |
| `website_url` | `text` |  Nullable |
| `logo_url` | `text` |  Nullable |
| `hero_image_url` | `text` |  Nullable |
| `description` | `text` |  Nullable |
| `abn` | `text` |  Nullable |
| `phone` | `text` |  Nullable |
| `status` | `text` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `hero_image_position_y` | `int2` |  |
| `pending_contact_full_name` | `text` |  Nullable |
| `pending_contact_email_primary` | `text` |  Nullable |
| `pending_contact_email_secondary` | `text` |  Nullable |
| `pending_contact_login_preference` | `text` |  |
| `hero_wide_image_url` | `text` |  Nullable |
| `hero_wide_image_position_y` | `int2` |  |
| `widget_button_config` | `jsonb` |  |
| `logo_asset_id` | `uuid` |  Nullable |
| `hero_image_asset_id` | `uuid` |  Nullable |
| `hero_wide_image_asset_id` | `uuid` |  Nullable |
| `data_licence` | `jsonb` |  |

## Table `data_studio_user_profiles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `auth_user_id` | `uuid` |  Unique |
| `email` | `text` |  Unique |
| `full_name` | `text` |  Nullable |
| `global_role` | `text` |  |
| `status` | `text` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `company_email_primary` | `text` |  Nullable |
| `company_email_secondary` | `text` |  Nullable |
| `login_email_preference` | `text` |  |

## Table `document_chunks`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `source_document_id` | `uuid` |  |
| `document_page_id` | `uuid` |  Nullable |
| `extraction_run_id` | `uuid` |  Nullable |
| `page_number` | `int4` |  Nullable |
| `chunk_index` | `int4` |  |
| `heading` | `text` |  Nullable |
| `chunk_type` | `text` |  Nullable |
| `raw_text` | `text` |  Nullable |
| `table_json` | `jsonb` |  Nullable |
| `docling_json` | `jsonb` |  Nullable |
| `confidence` | `numeric` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `document_pages`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `source_document_id` | `uuid` |  |
| `page_number` | `int4` |  |
| `page_image_storage_key` | `text` |  Nullable |
| `page_text` | `text` |  Nullable |
| `docling_json` | `jsonb` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `extraction_runs`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `source_document_id` | `uuid` |  |
| `run_type` | `text` |  |
| `status` | `text` |  |
| `tool_name` | `text` |  Nullable |
| `tool_version` | `text` |  Nullable |
| `model_name` | `text` |  Nullable |
| `started_at` | `timestamptz` |  Nullable |
| `completed_at` | `timestamptz` |  Nullable |
| `error_message` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `field_verifications`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `entity_type` | `text` |  |
| `entity_id` | `uuid` |  |
| `field_name` | `text` |  |
| `extracted_value` | `text` |  Nullable |
| `verified_value` | `text` |  Nullable |
| `source_document_id` | `uuid` |  Nullable |
| `source_page_id` | `uuid` |  Nullable |
| `source_chunk_id` | `uuid` |  Nullable |
| `source_page_number` | `int4` |  Nullable |
| `status` | `text` |  |
| `confidence` | `numeric` |  Nullable |
| `reviewer_id` | `uuid` |  Nullable |
| `reviewed_at` | `timestamptz` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `manufacturer_users`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `auth_user_id` | `uuid` |  Nullable |
| `email` | `text` |  |
| `role` | `text` |  |
| `status` | `text` |  |
| `created_at` | `timestamptz` |  |
| `user_profile_id` | `uuid` |  Nullable |
| `invited_by` | `uuid` |  Nullable |
| `invited_at` | `timestamptz` |  Nullable |
| `accepted_at` | `timestamptz` |  Nullable |
| `last_active_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  |

## Table `parser_field_evidence`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `extraction_run_id` | `uuid` |  |
| `entity_type` | `text` |  |
| `entity_id` | `uuid` |  |
| `field_name` | `text` |  |
| `extracted_value` | `text` |  Nullable |
| `source_document_id` | `uuid` |  Nullable |
| `source_page_number` | `int4` |  Nullable |
| `source_chunk_id` | `uuid` |  Nullable |
| `confidence` | `numeric` |  Nullable |
| `is_uncertain` | `bool` |  |
| `parser_note` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `publish_batch_items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `publish_batch_id` | `uuid` |  |
| `entity_type` | `text` |  |
| `entity_id` | `uuid` |  |
| `production_table` | `text` |  Nullable |
| `production_id` | `uuid` |  Nullable |
| `status` | `text` |  |
| `error_message` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `change_type` | `text` |  |

## Table `publish_batches`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  Nullable |
| `status` | `text` |  |
| `export_type` | `text` |  |
| `production_project_ref` | `text` |  Nullable |
| `created_by` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  |
| `approved_at` | `timestamptz` |  Nullable |
| `published_at` | `timestamptz` |  Nullable |
| `notes` | `text` |  Nullable |

## Table `source_documents`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `original_filename` | `text` |  |
| `document_name` | `text` |  |
| `document_type` | `text` |  Nullable |
| `document_date` | `text` |  Nullable |
| `storage_provider` | `text` |  |
| `storage_bucket` | `text` |  Nullable |
| `storage_key` | `text` |  Nullable |
| `public_url` | `text` |  Nullable |
| `file_mime_type` | `text` |  Nullable |
| `file_size_bytes` | `int8` |  Nullable |
| `status` | `text` |  |
| `uploaded_by` | `uuid` |  Nullable |
| `uploaded_at` | `timestamptz` |  |
| `notes` | `text` |  Nullable |
| `production_catalogue_source_id` | `uuid` |  Nullable |
| `source_url` | `text` |  Nullable |
| `ingest_kind` | `text` |  |

## Table `staged_components`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `source_document_id` | `uuid` |  Nullable |
| `source_chunk_id` | `uuid` |  Nullable |
| `production_component_id` | `uuid` |  Nullable |
| `sku` | `text` |  Nullable |
| `name` | `text` |  |
| `description` | `text` |  Nullable |
| `category` | `text` |  Nullable |
| `uom` | `text` |  Nullable |
| `length_mm` | `numeric` |  Nullable |
| `width_mm` | `numeric` |  Nullable |
| `height_mm` | `numeric` |  Nullable |
| `thickness_mm` | `numeric` |  Nullable |
| `depth_mm` | `numeric` |  Nullable |
| `gauge_mm` | `numeric` |  Nullable |
| `diameter_mm` | `numeric` |  Nullable |
| `roll_m` | `numeric` |  Nullable |
| `weight_kg` | `numeric` |  Nullable |
| `pieces` | `int4` |  Nullable |
| `material` | `text` |  Nullable |
| `finish` | `text` |  Nullable |
| `colour` | `text` |  Nullable |
| `profile` | `text` |  Nullable |
| `texture` | `text` |  Nullable |
| `coverage_m2` | `numeric` |  Nullable |
| `sort_order` | `int4` |  |
| `extraction_confidence` | `numeric` |  Nullable |
| `verification_status` | `text` |  |
| `verified_by` | `uuid` |  Nullable |
| `verified_at` | `timestamptz` |  Nullable |
| `reviewer_notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `volume_ml` | `numeric` |  Nullable |
| `weight_g` | `numeric` |  Nullable |
| `pack_format` | `text` |  Nullable |
| `supplier_pack_qty` | `numeric` |  Nullable |
| `supplier_pack_uom` | `text` |  Nullable |
| `supplier_pack_note` | `text` |  Nullable |
| `parser_notes` | `jsonb` |  Nullable |
| `image_url` | `text` |  Nullable |
| `website_url` | `text` |  Nullable |
| `extracted_at` | `timestamptz` |  Nullable |
| `procurement_route` | `text` |  Nullable |

## Table `staged_system_colours`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `staged_system_id` | `uuid` |  |
| `colour_name` | `text` |  |
| `sku` | `text` |  Nullable |
| `image_url` | `text` |  Nullable |
| `is_stocked` | `bool` |  |
| `sort_order` | `int4` |  |
| `verification_status` | `text` |  |
| `reviewer_notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `parser_notes` | `jsonb` |  Nullable |
| `sku_suffix` | `text` |  Nullable |
| `extracted_at` | `timestamptz` |  Nullable |
| `production_colour_id` | `uuid` |  Nullable |
| `image_asset_id` | `uuid` |  Nullable |

## Table `staged_system_components`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `staged_system_id` | `uuid` |  |
| `staged_component_id` | `uuid` |  |
| `role` | `text` |  |
| `notes` | `text` |  Nullable |
| `sort_order` | `int4` |  |
| `extraction_confidence` | `numeric` |  Nullable |
| `verification_status` | `text` |  |
| `verified_by` | `uuid` |  Nullable |
| `verified_at` | `timestamptz` |  Nullable |
| `reviewer_notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `parser_notes` | `jsonb` |  Nullable |
| `extracted_at` | `timestamptz` |  Nullable |

## Table `staged_system_profiles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `staged_system_id` | `uuid` |  |
| `name` | `text` |  Nullable |
| `product_code` | `text` |  Nullable |
| `dimensions` | `text` |  Nullable |
| `length_m` | `numeric` |  Nullable |
| `sheet_format` | `text` |  Nullable |
| `sort_order` | `int4` |  |
| `verification_status` | `text` |  |
| `reviewer_notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `profile_name` | `text` |  Nullable |
| `length_mm` | `numeric` |  Nullable |
| `width_mm` | `numeric` |  Nullable |
| `height_mm` | `numeric` |  Nullable |
| `thickness_mm` | `numeric` |  Nullable |
| `depth_mm` | `numeric` |  Nullable |
| `gauge_mm` | `numeric` |  Nullable |
| `diameter_mm` | `numeric` |  Nullable |
| `roll_m` | `numeric` |  Nullable |
| `weight_kg` | `numeric` |  Nullable |
| `pieces` | `numeric` |  Nullable |
| `volume_ml` | `numeric` |  Nullable |
| `weight_g` | `numeric` |  Nullable |
| `pack_format` | `text` |  Nullable |
| `supplier_pack_qty` | `numeric` |  Nullable |
| `supplier_pack_uom` | `text` |  Nullable |
| `supplier_pack_note` | `text` |  Nullable |
| `bal_rating` | `text` |  Nullable |
| `parser_notes` | `jsonb` |  Nullable |
| `uom` | `text` |  Nullable |
| `image_url` | `text` |  Nullable |
| `website_url` | `text` |  Nullable |
| `extracted_at` | `timestamptz` |  Nullable |
| `procurement_route` | `text` |  Nullable |
| `production_profile_id` | `uuid` |  Nullable |
| `description` | `text` |  Nullable |

## Table `staged_systems`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `source_document_id` | `uuid` |  Nullable |
| `source_chunk_id` | `uuid` |  Nullable |
| `production_system_id` | `uuid` |  Nullable |
| `name` | `text` |  |
| `product_code` | `text` |  Nullable |
| `slug` | `text` |  Nullable |
| `category` | `text` |  Nullable |
| `subcategory` | `text` |  Nullable |
| `description` | `text` |  Nullable |
| `dimensions` | `text` |  Nullable |
| `length_m` | `numeric` |  Nullable |
| `double_sided` | `bool` |  |
| `hero_image_url` | `text` |  Nullable |
| `website_url` | `text` |  Nullable |
| `source_label` | `text` |  Nullable |
| `source_url` | `text` |  Nullable |
| `sheet_format` | `text` |  Nullable |
| `fire_rating` | `text` |  Nullable |
| `acoustic_rating` | `text` |  Nullable |
| `moisture_resistant` | `bool` |  |
| `structural_grade` | `text` |  Nullable |
| `tech_data_url` | `text` |  Nullable |
| `sort_order` | `int4` |  |
| `extraction_confidence` | `numeric` |  Nullable |
| `verification_status` | `text` |  |
| `verified_by` | `uuid` |  Nullable |
| `verified_at` | `timestamptz` |  Nullable |
| `reviewer_notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `notes` | `text` |  Nullable |
| `parser_notes` | `jsonb` |  Nullable |
| `bal_rating` | `text` |  Nullable |
| `extracted_at` | `timestamptz` |  Nullable |
| `australian_made` | `bool` |  Nullable |
| `install_guide_urls` | `jsonb` |  Nullable |
| `design_guide_url` | `text` |  Nullable |
| `last_submitted_at` | `timestamptz` |  Nullable |
| `last_published_at` | `timestamptz` |  Nullable |
| `hero_image_position_x` | `int2` |  |
| `hero_image_position_y` | `int2` |  |
| `hero_image_asset_id` | `uuid` |  Nullable |
| `gallery_images` | `jsonb` |  |
| `publish_status` | `text` |  |
| `published_version` | `text` |  Nullable |
| `owner_account_id` | `uuid` |  Nullable |
| `custom_document_links` | `jsonb` |  Nullable |
| `hero_image_zoom` | `numeric` |  |
| `custom_technical_attributes` | `jsonb` |  Nullable |
| `lifecycle_status` | `text` |  |
| `search_aliases` | `_text` |  Nullable |
| `agent_ready_verified_at` | `timestamptz` |  Nullable |
| `agent_ready_verified_by` | `uuid` |  Nullable |
| `agent_ready_notes` | `text` |  Nullable |

## Table `verification_events`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `entity_type` | `text` |  |
| `entity_id` | `uuid` |  |
| `action` | `text` |  |
| `field_name` | `text` |  Nullable |
| `old_value` | `text` |  Nullable |
| `new_value` | `text` |  Nullable |
| `reviewer_id` | `uuid` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `workspace_invitations`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `email` | `text` |  |
| `role` | `text` |  |
| `token_hash` | `text` |  Nullable |
| `status` | `text` |  |
| `invited_by` | `uuid` |  Nullable |
| `invited_at` | `timestamptz` |  |
| `expires_at` | `timestamptz` |  Nullable |
| `accepted_at` | `timestamptz` |  Nullable |

## Table `pipeline_jobs`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `document_id` | `uuid` |  Nullable |
| `job_type` | `text` |  |
| `status` | `text` |  |
| `payload` | `jsonb` |  |
| `result` | `jsonb` |  Nullable |
| `error_message` | `text` |  Nullable |
| `log_lines` | `_text` |  Nullable |
| `progress` | `jsonb` |  Nullable |
| `created_at` | `timestamptz` |  |
| `started_at` | `timestamptz` |  Nullable |
| `completed_at` | `timestamptz` |  Nullable |
| `worker_id` | `text` |  Nullable |
| `heartbeat_at` | `timestamptz` |  Nullable |

## Table `manufacturer_embed_widgets`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `public_token` | `text` |  Unique |
| `status` | `text` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `manufacturer_embed_widget_systems`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `embed_widget_id` | `uuid` |  |
| `staged_system_id` | `uuid` |  |
| `sort_order` | `int4` |  |

## Table `manufacturer_messages`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `sender_type` | `text` |  |
| `sender_user_id` | `uuid` |  Nullable |
| `sender_label` | `text` |  Nullable |
| `body` | `text` |  |
| `message_type` | `text` |  |
| `related_publish_batch_id` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  |
| `acknowledged_at` | `timestamptz` |  Nullable |

## Table `widget_quote_requests`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `widget_id` | `uuid` |  Nullable |
| `system_id` | `text` |  |
| `system_name` | `text` |  Nullable |
| `selected_items` | `jsonb` |  |
| `name` | `text` |  |
| `email` | `text` |  |
| `phone` | `text` |  Nullable |
| `postcode` | `text` |  Nullable |
| `project_type` | `text` |  Nullable |
| `timeline` | `text` |  Nullable |
| `message` | `text` |  Nullable |
| `status` | `text` |  |
| `created_at` | `timestamptz` |  |

## Table `manufacturer_assets`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `asset_type` | `text` |  |
| `title` | `text` |  Nullable |
| `alt_text` | `text` |  Nullable |
| `caption` | `text` |  Nullable |
| `storage_key` | `text` |  Nullable |
| `source_url` | `text` |  Nullable |
| `public_url` | `text` |  Nullable |
| `mime_type` | `text` |  Nullable |
| `file_size_bytes` | `int8` |  Nullable |
| `width` | `int4` |  Nullable |
| `height` | `int4` |  Nullable |
| `focal_x` | `int2` |  |
| `focal_y` | `int2` |  |
| `approved_for_publication` | `bool` |  |
| `archived` | `bool` |  |
| `created_by` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `staged_system_id` | `uuid` |  Nullable |
| `asset_role` | `text` |  Nullable |

## Table `card_packages`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `package_version` | `int4` |  |
| `status` | `text` |  |
| `intended_install_path` | `text` |  |
| `zip_storage_key` | `text` |  Nullable |
| `zip_url` | `text` |  Nullable |
| `manifest_url` | `text` |  Nullable |
| `feed_url` | `text` |  Nullable |
| `preview_url` | `text` |  Nullable |
| `checksum` | `text` |  Nullable |
| `file_size_bytes` | `int8` |  Nullable |
| `card_count` | `int4` |  |
| `error_message` | `text` |  Nullable |
| `build_log` | `text` |  Nullable |
| `generated_at` | `timestamptz` |  Nullable |
| `generated_by` | `uuid` |  Nullable |
| `downloaded_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `card_package_items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `package_id` | `uuid` |  |
| `card_id` | `uuid` |  |
| `package_slug` | `text` |  |
| `generated_card_path` | `text` |  Nullable |
| `generated_json_path` | `text` |  Nullable |
| `qr_code_path` | `text` |  Nullable |
| `status` | `text` |  |
| `error_message` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `manufacturer_stockists`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `business_name` | `text` |  |
| `suburb` | `text` |  Nullable |
| `state` | `text` |  Nullable |
| `phone` | `text` |  Nullable |
| `website_url` | `text` |  Nullable |
| `trade_desk_email` | `text` |  Nullable |
| `all_cards` | `bool` |  |
| `confirm_token` | `uuid` |  |
| `confirm_status` | `text` |  |
| `confirmed_at` | `timestamptz` |  Nullable |
| `archived` | `bool` |  |
| `sort_order` | `int4` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `manufacturer_stockist_cards`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `stockist_id` | `uuid` |  |
| `card_id` | `uuid` |  |
| `created_at` | `timestamptz` |  |

## Table `card_versions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `card_id` | `uuid` |  |
| `package_id` | `uuid` |  Nullable |
| `version` | `int4` |  |
| `slug` | `text` |  |
| `name` | `text` |  |
| `card_json` | `jsonb` |  |
| `stockists_json` | `jsonb` |  Nullable |
| `validated_by` | `text` |  Nullable |
| `validated_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |
| `content_md` | `text` |  Nullable |
| `content_hash` | `text` |  Nullable |
| `sources_json` | `jsonb` |  Nullable |
| `knowledge_json` | `jsonb` |  Nullable |

## Table `card_share_links`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `card_id` | `uuid` |  Nullable |
| `card_slug` | `text` |  |
| `token` | `text` |  |
| `channel` | `text` |  |
| `sender_tag` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `card_events`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `card_id` | `uuid` |  Nullable |
| `card_slug` | `text` |  |
| `version` | `int4` |  Nullable |
| `event_type` | `text` |  |
| `channel` | `text` |  Nullable |
| `sender_tag` | `text` |  Nullable |
| `share_token` | `text` |  Nullable |
| `host_domain` | `text` |  Nullable |
| `doc_label` | `text` |  Nullable |
| `doc_url` | `text` |  Nullable |
| `device_hash` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `system_sources`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `staged_system_id` | `uuid` |  |
| `role` | `text` |  |
| `label` | `text` |  Nullable |
| `url` | `text` |  |
| `source_document_id` | `uuid` |  Nullable |
| `ingest_status` | `text` |  |
| `include_in_container` | `bool` |  |
| `error_message` | `text` |  Nullable |
| `sort_order` | `int4` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `ai_summary` | `text` |  Nullable |
| `ai_summary_generated_at` | `timestamptz` |  Nullable |

## Table `card_embeddings`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `card_id` | `uuid` |  |
| `version` | `int4` |  |
| `chunk_index` | `int4` |  |
| `source_role` | `text` |  Nullable |
| `page_start` | `int4` |  Nullable |
| `page_end` | `int4` |  Nullable |
| `content` | `text` |  |
| `embedding` | `vector` |  |
| `content_hash` | `text` |  |
| `created_at` | `timestamptz` |  |

## Table `card_publish_events`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `card_id` | `uuid` |  |
| `event_type` | `text` |  |
| `occurred_at` | `timestamptz` |  |
| `meta` | `jsonb` |  Nullable |

## Table `manufacturer_link_library`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `label` | `text` |  |
| `url` | `text` |  |
| `created_by` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `knowledge_assertions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `staged_system_id` | `uuid` |  Nullable |
| `subject_kind` | `text` |  |
| `subject_ref` | `uuid` |  Nullable |
| `subject_local_id` | `text` |  Nullable |
| `predicate` | `text` |  |
| `object_kind` | `text` |  |
| `object_value` | `jsonb` |  |
| `claim_type` | `text` |  |
| `origin` | `text` |  |
| `epistemic_status` | `text` |  |
| `answer_policy` | `text` |  Nullable |
| `confidence` | `numeric` |  Nullable |
| `derivation` | `jsonb` |  Nullable |
| `supersedes_assertion_id` | `uuid` |  Nullable |
| `inherited_from_assertion_id` | `uuid` |  Nullable |
| `extraction_run_id` | `uuid` |  Nullable |
| `verified_by` | `uuid` |  Nullable |
| `verified_at` | `timestamptz` |  Nullable |
| `evidence_refreshed_at` | `timestamptz` |  Nullable |
| `review_horizon` | `date` |  Nullable |
| `reviewer_notes` | `text` |  Nullable |
| `sort_order` | `int4` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `assertion_evidence`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `assertion_id` | `uuid` |  |
| `source_kind` | `text` |  |
| `source_document_id` | `uuid` |  Nullable |
| `system_source_id` | `uuid` |  Nullable |
| `document_chunk_id` | `uuid` |  Nullable |
| `page_start` | `int4` |  Nullable |
| `page_end` | `int4` |  Nullable |
| `locator` | `text` |  Nullable |
| `quote` | `text` |  Nullable |
| `source_url` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `system_relationships`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `manufacturer_id` | `uuid` |  |
| `staged_system_id` | `uuid` |  |
| `relation` | `text` |  |
| `target_staged_system_id` | `uuid` |  Nullable |
| `target_external` | `jsonb` |  Nullable |
| `note` | `text` |  Nullable |
| `reason` | `text` |  Nullable |
| `epistemic_status` | `text` |  |
| `verified_by` | `uuid` |  Nullable |
| `verified_at` | `timestamptz` |  Nullable |
| `sort_order` | `int4` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `knowledge_taxonomy_terms`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `domain` | `text` |  |
| `slug` | `text` |  |
| `label` | `text` |  |

## Table `ai_knowledge_gaps`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `status` | `text` |  |
| `failure_type` | `text` |  Nullable |
| `priority` | `text` |  |
| `user_question` | `text` |  |
| `normalised_question` | `jsonb` |  Nullable |
| `staged_system_id` | `uuid` |  Nullable |
| `manufacturer_id` | `uuid` |  Nullable |
| `anon_session_id` | `text` |  Nullable |
| `builder_user_id` | `uuid` |  Nullable |
| `ai_response_status` | `text` |  |
| `retrieval_summary` | `jsonb` |  Nullable |
| `matched_assertion_ids` | `_text` |  Nullable |
| `missing_information` | `text` |  Nullable |
| `repeat_count` | `int4` |  |
| `cluster_id` | `uuid` |  Nullable |
| `manufacturer_response` | `jsonb` |  Nullable |
| `resolution_type` | `text` |  Nullable |
| `resulting_assertion_ids` | `_uuid` |  Nullable |
| `resolution_notes` | `text` |  Nullable |
| `assigned_to` | `uuid` |  Nullable |
| `resolved_by` | `uuid` |  Nullable |
| `resolved_at` | `timestamptz` |  Nullable |
| `manufacturer_verification_required` | `bool` |  |

## RLS Policies

### `card_events`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can read all card events` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `manufacturer_user can read own card events` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = card_events.manufacturer_id) AND (mu.status = 'active'::text))))` | — |

### `card_share_links`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can create share links` | INSERT | authenticated | PERMISSIVE | — | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `buildquote staff can read all share links` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `manufacturer_user can create own share links` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = card_share_links.manufacturer_id) AND (mu.status = 'active'::text))))` |
| `manufacturer_user can read own share links` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = card_share_links.manufacturer_id) AND (mu.status = 'active'::text))))` | — |

### `data_studio_user_profiles`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can read all profiles` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `user can read own profile` | SELECT | authenticated | PERMISSIVE | `(auth_user_id = auth.uid())` | — |
| `user can update own profile` | UPDATE | authenticated | PERMISSIVE | `(auth_user_id = auth.uid())` | `(auth_user_id = auth.uid())` |
| `users can read own profile` | SELECT | public | PERMISSIVE | `(auth.uid() = auth_user_id)` | — |

### `document_chunks`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read document chunks` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can read document chunks` | SELECT | authenticated | PERMISSIVE | `true` | — |

### `document_pages`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read document pages` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can read document pages` | SELECT | authenticated | PERMISSIVE | `true` | — |

### `data_studio_manufacturers`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read manufacturers` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can read manufacturers` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `buildquote_admin can insert manufacturer` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM data_studio_user_profiles p   WHERE ((p.auth_user_id = auth.uid()) AND (p.global_role = 'buildquote_admin'::text))))` |
| `buildquote_admin can update any manufacturer` | UPDATE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM data_studio_user_profiles p   WHERE ((p.auth_user_id = auth.uid()) AND (p.global_role = 'buildquote_admin'::text))))` | `true` |
| `manufacturer_user can update own workspace` | UPDATE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = data_studio_manufacturers.id) AND (mu.status = 'active'::text))))` | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = data_studio_manufacturers.id) AND (mu.status = 'active'::text))))` |

### `extraction_runs`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read extraction runs` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can read extraction runs` | SELECT | authenticated | PERMISSIVE | `true` | — |

### `staged_components`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read staged components` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can insert staged components` | INSERT | authenticated | PERMISSIVE | — | `true` |
| `authenticated can read staged components` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `authenticated can update staged components` | UPDATE | authenticated | PERMISSIVE | `true` | `true` |

### `field_verifications`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read field verifications` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can delete field verifications` | DELETE | authenticated | PERMISSIVE | `true` | — |
| `authenticated can insert field verifications` | INSERT | authenticated | PERMISSIVE | — | `true` |
| `authenticated can read field verifications` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `authenticated can update field verifications` | UPDATE | authenticated | PERMISSIVE | `true` | `true` |

### `publish_batches`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can delete publish batches` | DELETE | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `buildquote staff can insert publish batches` | INSERT | authenticated | PERMISSIVE | — | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `buildquote staff can read all publish batches` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `buildquote staff can update publish batches` | UPDATE | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `manufacturer_user can read own publish batches` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = publish_batches.manufacturer_id) AND (mu.status = 'active'::text))))` | — |
| `manufacturer_user can submit own publish batches` | INSERT | authenticated | PERMISSIVE | — | `((EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = publish_batches.manufacturer_id) AND (mu.status = 'active'::text)))) AND (status = 'submitted'::text) AND (approved_at IS NULL) AND (published_at IS NULL))` |

### `manufacturer_users`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `users can read own membership` | SELECT | authenticated | PERMISSIVE | `(auth_user_id = auth.uid())` | — |

### `parser_field_evidence`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read parser field evidence` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can read parser field evidence` | SELECT | authenticated | PERMISSIVE | `true` | — |

### `publish_batch_items`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can delete publish batch items` | DELETE | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `buildquote staff can insert publish batch items` | INSERT | authenticated | PERMISSIVE | — | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `buildquote staff can read all publish batch items` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `buildquote staff can update publish batch items` | UPDATE | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `manufacturer_user can insert own publish batch items` | INSERT | authenticated | PERMISSIVE | — | `((EXISTS ( SELECT 1    FROM (publish_batches pb      JOIN manufacturer_users mu ON ((mu.manufacturer_id = pb.manufacturer_id)))   WHERE ((pb.id = publish_batch_items.publish_batch_id) AND (mu.auth_user_id = auth.uid()) AND (mu.status = 'active'::text)))) AND (status = 'pending'::text) AND (production_table IS NULL) AND (production_id IS NULL))` |
| `manufacturer_user can read own publish batch items` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM (publish_batches pb      JOIN manufacturer_users mu ON ((mu.manufacturer_id = pb.manufacturer_id)))   WHERE ((pb.id = publish_batch_items.publish_batch_id) AND (mu.auth_user_id = auth.uid()) AND (mu.status = 'active'::text))))` | — |

### `staged_system_components`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read staged system components` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can delete staged system components` | DELETE | authenticated | PERMISSIVE | `true` | — |
| `authenticated can insert staged system components` | INSERT | authenticated | PERMISSIVE | — | `true` |
| `authenticated can read staged system components` | SELECT | authenticated | PERMISSIVE | `true` | — |

### `source_documents`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read source documents` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can read source documents` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `buildquote_admin can insert source_documents` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM data_studio_user_profiles p   WHERE ((p.auth_user_id = auth.uid()) AND (p.global_role = 'buildquote_admin'::text))))` |
| `manufacturer_user can insert own source_documents` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = source_documents.manufacturer_id) AND (mu.status = 'active'::text))))` |

### `staged_system_colours`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read staged system colours` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can delete staged system colours` | DELETE | authenticated | PERMISSIVE | `true` | — |
| `authenticated can insert staged system colours` | INSERT | authenticated | PERMISSIVE | — | `true` |
| `authenticated can read staged system colours` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `authenticated can update staged system colours` | UPDATE | authenticated | PERMISSIVE | `true` | `true` |

### `pipeline_jobs`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `authenticated can read own manufacturer jobs` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `service role full access` | ALL | service_role | PERMISSIVE | `true` | `true` |

### `staged_system_profiles`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read staged system profiles` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can delete staged system profiles` | DELETE | authenticated | PERMISSIVE | `true` | — |
| `authenticated can insert staged system profiles` | INSERT | authenticated | PERMISSIVE | — | `true` |
| `authenticated can read staged system profiles` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `authenticated can update staged system profiles` | UPDATE | authenticated | PERMISSIVE | `true` | `true` |

### `manufacturer_embed_widgets`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `manufacturer_embed_widgets_public_read` | SELECT | public | PERMISSIVE | `(status = 'active'::text)` | — |
| `manufacturer_embed_widgets_read` | SELECT | public | PERMISSIVE | `(manufacturer_id IN ( SELECT manufacturer_users.manufacturer_id    FROM manufacturer_users   WHERE ((manufacturer_users.auth_user_id = auth.uid()) AND (manufacturer_users.status = 'active'::text))))` | — |
| `manufacturer_embed_widgets_write` | ALL | public | PERMISSIVE | `(manufacturer_id IN ( SELECT manufacturer_users.manufacturer_id    FROM manufacturer_users   WHERE ((manufacturer_users.auth_user_id = auth.uid()) AND (manufacturer_users.status = 'active'::text))))` | — |

### `manufacturer_embed_widget_systems`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `manufacturer_embed_widget_systems_read` | SELECT | public | PERMISSIVE | `true` | — |
| `manufacturer_embed_widget_systems_write` | ALL | public | PERMISSIVE | `(embed_widget_id IN ( SELECT manufacturer_embed_widgets.id    FROM manufacturer_embed_widgets   WHERE (manufacturer_embed_widgets.manufacturer_id IN ( SELECT manufacturer_users.manufacturer_id            FROM manufacturer_users           WHERE ((manufacturer_users.auth_user_id = auth.uid()) AND (manufacturer_users.status = 'active'::text))))))` | — |

### `widget_quote_requests`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `admin read all quote requests` | SELECT | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM data_studio_user_profiles   WHERE ((data_studio_user_profiles.auth_user_id = auth.uid()) AND (data_studio_user_profiles.global_role = 'buildquote_admin'::text))))` | — |
| `manufacturer read own quote requests` | SELECT | public | PERMISSIVE | `(manufacturer_id IN ( SELECT manufacturer_users.manufacturer_id    FROM manufacturer_users   WHERE ((manufacturer_users.auth_user_id = auth.uid()) AND (manufacturer_users.status = 'active'::text))))` | — |
| `manufacturer update own quote request status` | UPDATE | public | PERMISSIVE | `(manufacturer_id IN ( SELECT manufacturer_users.manufacturer_id    FROM manufacturer_users   WHERE ((manufacturer_users.auth_user_id = auth.uid()) AND (manufacturer_users.status = 'active'::text))))` | — |

### `manufacturer_messages`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can read all messages` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `buildquote staff can send messages` | INSERT | authenticated | PERMISSIVE | — | `((sender_type = 'buildquote'::text) AND (get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text])))` |
| `manufacturer_user can acknowledge buildquote messages` | UPDATE | authenticated | PERMISSIVE | `((sender_type = 'buildquote'::text) AND (EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_messages.manufacturer_id) AND (mu.status = 'active'::text)))))` | `((sender_type = 'buildquote'::text) AND (EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_messages.manufacturer_id) AND (mu.status = 'active'::text)))))` |
| `manufacturer_user can read own messages` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_messages.manufacturer_id) AND (mu.status = 'active'::text))))` | — |
| `manufacturer_user can send own messages` | INSERT | authenticated | PERMISSIVE | — | `((sender_type = 'manufacturer'::text) AND (sender_user_id = auth.uid()) AND (EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_messages.manufacturer_id) AND (mu.status = 'active'::text)))))` |

### `manufacturer_stockists`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can create stockists` | INSERT | authenticated | PERMISSIVE | — | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `buildquote staff can delete stockists` | DELETE | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `buildquote staff can read all stockists` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `buildquote staff can update stockists` | UPDATE | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `manufacturer_user can create own stockists` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_stockists.manufacturer_id) AND (mu.status = 'active'::text))))` |
| `manufacturer_user can delete own stockists` | DELETE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_stockists.manufacturer_id) AND (mu.status = 'active'::text))))` | — |
| `manufacturer_user can read own stockists` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_stockists.manufacturer_id) AND (mu.status = 'active'::text))))` | — |
| `manufacturer_user can update own stockists` | UPDATE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_stockists.manufacturer_id) AND (mu.status = 'active'::text))))` | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_stockists.manufacturer_id) AND (mu.status = 'active'::text))))` |

### `card_packages`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can create packages` | INSERT | authenticated | PERMISSIVE | — | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `buildquote staff can read all packages` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `buildquote staff can update packages` | UPDATE | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `manufacturer_user can create own packages` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = card_packages.manufacturer_id) AND (mu.status = 'active'::text))))` |
| `manufacturer_user can read own packages` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = card_packages.manufacturer_id) AND (mu.status = 'active'::text))))` | — |
| `manufacturer_user can update own packages` | UPDATE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = card_packages.manufacturer_id) AND (mu.status = 'active'::text))))` | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = card_packages.manufacturer_id) AND (mu.status = 'active'::text))))` |

### `card_package_items`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can create package items` | INSERT | authenticated | PERMISSIVE | — | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `buildquote staff can read all package items` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `manufacturer_user can create own package items` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM (card_packages cp      JOIN manufacturer_users mu ON ((mu.manufacturer_id = cp.manufacturer_id)))   WHERE ((cp.id = card_package_items.package_id) AND (mu.auth_user_id = auth.uid()) AND (mu.status = 'active'::text))))` |
| `manufacturer_user can read own package items` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM (card_packages cp      JOIN manufacturer_users mu ON ((mu.manufacturer_id = cp.manufacturer_id)))   WHERE ((cp.id = card_package_items.package_id) AND (mu.auth_user_id = auth.uid()) AND (mu.status = 'active'::text))))` | — |

### `manufacturer_stockist_cards`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can create stockist cards` | INSERT | authenticated | PERMISSIVE | — | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `buildquote staff can delete stockist cards` | DELETE | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `buildquote staff can read all stockist cards` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `manufacturer_user can create own stockist cards` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM (manufacturer_stockists ms      JOIN manufacturer_users mu ON ((mu.manufacturer_id = ms.manufacturer_id)))   WHERE ((ms.id = manufacturer_stockist_cards.stockist_id) AND (mu.auth_user_id = auth.uid()) AND (mu.status = 'active'::text))))` |
| `manufacturer_user can delete own stockist cards` | DELETE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM (manufacturer_stockists ms      JOIN manufacturer_users mu ON ((mu.manufacturer_id = ms.manufacturer_id)))   WHERE ((ms.id = manufacturer_stockist_cards.stockist_id) AND (mu.auth_user_id = auth.uid()) AND (mu.status = 'active'::text))))` | — |
| `manufacturer_user can read own stockist cards` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM (manufacturer_stockists ms      JOIN manufacturer_users mu ON ((mu.manufacturer_id = ms.manufacturer_id)))   WHERE ((ms.id = manufacturer_stockist_cards.stockist_id) AND (mu.auth_user_id = auth.uid()) AND (mu.status = 'active'::text))))` | — |

### `manufacturer_assets`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can create assets` | INSERT | authenticated | PERMISSIVE | — | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `buildquote staff can read all assets` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `buildquote staff can update assets` | UPDATE | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `manufacturer_user can create own assets` | INSERT | authenticated | PERMISSIVE | — | `((created_by = auth.uid()) AND (EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_assets.manufacturer_id) AND (mu.status = 'active'::text)))))` |
| `manufacturer_user can read own assets` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_assets.manufacturer_id) AND (mu.status = 'active'::text))))` | — |
| `manufacturer_user can update own assets` | UPDATE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_assets.manufacturer_id) AND (mu.status = 'active'::text))))` | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_assets.manufacturer_id) AND (mu.status = 'active'::text))))` |

### `card_publish_events`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can insert publish events` | INSERT | authenticated | PERMISSIVE | — | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `buildquote staff can read all publish events` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `manufacturer_user can insert own publish events` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM (staged_systems ss      JOIN manufacturer_users mu ON ((mu.manufacturer_id = ss.manufacturer_id)))   WHERE ((ss.id = card_publish_events.card_id) AND (mu.auth_user_id = auth.uid()) AND (mu.status = 'active'::text))))` |
| `manufacturer_user can read own publish events` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM (staged_systems ss      JOIN manufacturer_users mu ON ((mu.manufacturer_id = ss.manufacturer_id)))   WHERE ((ss.id = card_publish_events.card_id) AND (mu.auth_user_id = auth.uid()) AND (mu.status = 'active'::text))))` | — |

### `card_embeddings`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can read all card embeddings` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `manufacturer_user can read own card embeddings` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = card_embeddings.manufacturer_id) AND (mu.status = 'active'::text))))` | — |

### `manufacturer_link_library`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can create link library entries` | INSERT | authenticated | PERMISSIVE | — | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `buildquote staff can delete link library entries` | DELETE | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `buildquote staff can read all link libraries` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `buildquote staff can update link library entries` | UPDATE | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `manufacturer_user can create own link library entries` | INSERT | authenticated | PERMISSIVE | — | `((created_by = auth.uid()) AND (EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_link_library.manufacturer_id) AND (mu.status = 'active'::text)))))` |
| `manufacturer_user can delete own link library entries` | DELETE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_link_library.manufacturer_id) AND (mu.status = 'active'::text))))` | — |
| `manufacturer_user can read own link library` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_link_library.manufacturer_id) AND (mu.status = 'active'::text))))` | — |
| `manufacturer_user can update own link library entries` | UPDATE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_link_library.manufacturer_id) AND (mu.status = 'active'::text))))` | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = manufacturer_link_library.manufacturer_id) AND (mu.status = 'active'::text))))` |

### `system_sources`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can create system sources` | INSERT | authenticated | PERMISSIVE | — | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `buildquote staff can delete system sources` | DELETE | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `buildquote staff can read all system sources` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `buildquote staff can update system sources` | UPDATE | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `manufacturer_user can create own system sources` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = system_sources.manufacturer_id) AND (mu.status = 'active'::text))))` |
| `manufacturer_user can delete own system sources` | DELETE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = system_sources.manufacturer_id) AND (mu.status = 'active'::text))))` | — |
| `manufacturer_user can read own system sources` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = system_sources.manufacturer_id) AND (mu.status = 'active'::text))))` | — |
| `manufacturer_user can update own system sources` | UPDATE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = system_sources.manufacturer_id) AND (mu.status = 'active'::text))))` | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = system_sources.manufacturer_id) AND (mu.status = 'active'::text))))` |

### `card_versions`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can create card versions` | INSERT | authenticated | PERMISSIVE | — | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `buildquote staff can read all card versions` | SELECT | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | — |
| `manufacturer_user can create own card versions` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = card_versions.manufacturer_id) AND (mu.status = 'active'::text))))` |
| `manufacturer_user can read own card versions` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = card_versions.manufacturer_id) AND (mu.status = 'active'::text))))` | — |

### `knowledge_assertions`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read knowledge assertions` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can read knowledge assertions` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `buildquote staff can write all knowledge assertions` | ALL | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `manufacturer_user can write own knowledge assertions` | ALL | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = knowledge_assertions.manufacturer_id) AND (mu.status = 'active'::text))))` | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = knowledge_assertions.manufacturer_id) AND (mu.status = 'active'::text))))` |

### `assertion_evidence`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read assertion evidence` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can read assertion evidence` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `buildquote staff can write all assertion evidence` | ALL | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `manufacturer_user can write own assertion evidence` | ALL | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM (knowledge_assertions ka      JOIN manufacturer_users mu ON ((mu.manufacturer_id = ka.manufacturer_id)))   WHERE ((ka.id = assertion_evidence.assertion_id) AND (mu.auth_user_id = auth.uid()) AND (mu.status = 'active'::text))))` | `(EXISTS ( SELECT 1    FROM (knowledge_assertions ka      JOIN manufacturer_users mu ON ((mu.manufacturer_id = ka.manufacturer_id)))   WHERE ((ka.id = assertion_evidence.assertion_id) AND (mu.auth_user_id = auth.uid()) AND (mu.status = 'active'::text))))` |

### `system_relationships`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read system relationships` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can read system relationships` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `buildquote staff can write all system relationships` | ALL | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `manufacturer_user can write own system relationships` | ALL | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = system_relationships.manufacturer_id) AND (mu.status = 'active'::text))))` | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = system_relationships.manufacturer_id) AND (mu.status = 'active'::text))))` |

### `knowledge_taxonomy_terms`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read taxonomy terms` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can read taxonomy terms` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `buildquote staff can write taxonomy terms` | ALL | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |

### `ai_knowledge_gaps`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `buildquote staff can manage all knowledge gaps` | ALL | authenticated | PERMISSIVE | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` | `(get_my_global_role() = ANY (ARRAY['buildquote_admin'::text, 'buildquote_reviewer'::text]))` |
| `manufacturer_user can read own knowledge gaps` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = ai_knowledge_gaps.manufacturer_id) AND (mu.status = 'active'::text))))` | — |
| `manufacturer_user can resolve own knowledge gaps` | UPDATE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = ai_knowledge_gaps.manufacturer_id) AND (mu.status = 'active'::text))))` | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = ai_knowledge_gaps.manufacturer_id) AND (mu.status = 'active'::text))))` |

### `staged_systems`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `anon can read staged systems` | SELECT | anon | PERMISSIVE | `true` | — |
| `authenticated can read staged systems` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `authenticated can update staged systems verification` | UPDATE | authenticated | PERMISSIVE | `true` | `true` |
| `buildquote_admin can insert staged_systems` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM data_studio_user_profiles p   WHERE ((p.auth_user_id = auth.uid()) AND (p.global_role = 'buildquote_admin'::text))))` |
| `manufacturer_user can insert own staged_systems` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM manufacturer_users mu   WHERE ((mu.auth_user_id = auth.uid()) AND (mu.manufacturer_id = staged_systems.manufacturer_id) AND (mu.status = 'active'::text))))` |

