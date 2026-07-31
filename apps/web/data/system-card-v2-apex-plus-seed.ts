// Real-data snapshot for the System Card V2 design experiment
// (/system-card-v2/apex-plus). NOT hand-invented — every field below is
// copied from the live Data Studio record for Evalast / Apex PLUS
// (staged_systems.id 4414ff54-ac00-4eb2-89a2-9c77e00076bf, manufacturer_id
// c4958e13-e233-49f9-9a82-07b2575ed999), pulled 2026-07-31. Shaped through
// the SAME SystemCardSystem / SystemCardManufacturerPage types the existing
// master renderer uses — no forked data model.
//
// Two additions beyond what adaptStagedSystem.ts currently produces, both
// using real, already-uploaded assets the live adapter just doesn't wire up
// yet:
//   - system_colours[].image_url populated from the colours' real
//     image_asset_id (both now approved_for_publication).
//   - Durable asset URLs follow the same convention as
//     lib/publishing/buildCardSnapshot.ts's durableAssetUrl():
//     https://studio.buildquote.com.au/api/assets/<assetId>
//
// This file is a static, request-time-free snapshot (same pattern as
// data/system-card-preview-seed.ts) — no Supabase reads happen when
// /system-card-v2/apex-plus loads.

import type {
  SystemCardSystem,
  SystemCardManufacturerPage,
} from '@/components/system-card-renderer/types'

export const EVALAST_MANUFACTURER: SystemCardManufacturerPage = {
  name: 'Evalast',
  slug: 'evalast',
  description:
    'Eva-Last composite offers the beauty of timber, but in a hassle-free, durable option that’s longer lasting, virtually maintenance free, and eco-friendly. Cutting-edge engineering is bringing even greater structural advancements and lifestyle benefits to composite, and thoughtful detail to aesthetics now gives it an even more natural appearance in an expanded range of products, colours, and textures.',
  website_url: 'https://www.eva-last.net.au/',
  logo_url: null,
  hero_image_url: null,
  hero_wide_image_url: 'https://studio.buildquote.com.au/api/assets/45bb493e-5327-459c-92bd-54c74137788e',
  hero_image_position_y: 78,
}

export const APEX_PLUS_SYSTEM: SystemCardSystem = {
  id: '4414ff54-ac00-4eb2-89a2-9c77e00076bf',
  name: 'Apex PLUS',
  product_code: null,
  slug: 'apex-plus',
  category: 'Decking',
  subcategory: 'Composite decking',
  description:
    'Apex PLUS sets the standard for natural looking composite. Its cellular foamed-PVC and glass fiber-reinforced core allows for increased span capability. Low-maintenance Apex PLUS is more stable with less expansion and contraction and requires only basic cleaning for optimal longevity. Its protective cap is made from a resilient acrylic polymer coating, offering long-term fade, scratch, and stain resistance. Apex PLUS also provides decay resistance against insects, moisture, and the elements. Apex PLUS offers an eco-friendly alternative to timber that prevents deforestation and premature deck replacement and uses solar power within the manufacturing process.',

  hero_image_url: 'https://studio.buildquote.com.au/api/assets/3fc5f77b-f583-458b-836a-5134d6e41cc8',
  hero_image_position_x: 50,
  hero_image_position_y: 65,
  hero_image_zoom: 1,
  gallery_images: [
    {
      asset_id: '3fc5f77b-f583-458b-836a-5134d6e41cc8',
      url: 'https://studio.buildquote.com.au/api/assets/3fc5f77b-f583-458b-836a-5134d6e41cc8',
      og_jpg_url: null,
      alt: 'Apex-Plus-Image-Slider-Brazilian-Teak',
      caption: null,
    },
    {
      asset_id: 'e0c157b4-c0ac-4123-b3f6-7c1b7e1f2d8b',
      url: 'https://studio.buildquote.com.au/api/assets/e0c157b4-c0ac-4123-b3f6-7c1b7e1f2d8b',
      og_jpg_url: null,
      alt: 'Apex-Plus-Image-Slider-Alaskan-Driftwood',
      caption: null,
    },
    {
      asset_id: 'fcfaf077-77ff-4762-bf32-9c5fb43ed32f',
      url: 'https://studio.buildquote.com.au/api/assets/fcfaf077-77ff-4762-bf32-9c5fb43ed32f',
      og_jpg_url: null,
      alt: 'Apex-Plus-Image-Slider-Hawaiian-Walnut',
      caption: null,
    },
    {
      asset_id: 'fc9638e8-0f30-4c8a-b187-aef632b98a99',
      url: 'https://studio.buildquote.com.au/api/assets/fc9638e8-0f30-4c8a-b187-aef632b98a99',
      og_jpg_url: null,
      alt: 'ApexAsset-banner-himalayan',
      caption: null,
    },
    {
      asset_id: '1e7a5625-2ea1-42cb-81df-154812925c0c',
      url: 'https://studio.buildquote.com.au/api/assets/1e7a5625-2ea1-42cb-81df-154812925c0c',
      og_jpg_url: null,
      alt: 'apex-plus-himalayan-grooved-300x300',
      caption: null,
    },
  ],

  australian_made: null,
  bal_rating: null,
  fire_rating: null,
  moisture_resistant: true,
  acoustic_rating: null,
  structural_grade: null,
  notes:
    'Dual tone colour technology. Also available as VistaClad cladding profiles (separate product, not included here). Source: AU-WA-Brochure.pdf.',
  // Real value, sourced from the Rectangular profile's parser_notes.uses
  // field ("decking, cladding, edging, screening") — not invented.
  applications: ['Decking', 'Cladding', 'Edging', 'Screening'],

  website_url: 'https://www.eva-last.net.au/product/brand/apex/',
  install_guide_urls: null,
  design_guide_url: null,
  tech_data_url: null,
  custom_document_links: [
    { label: 'HULK Fasteners Colour guide', url: 'https://resource.eva-last.com/Resource/Hulk/HULK-Fasteners-Colour-guide.pdf' },
    { label: 'Decking calculator', url: 'https://www.eva-last.net.au/material-estimator/' },
  ],
  custom_technical_attributes: null,

  manufacturer: {
    name: 'Evalast',
    slug: 'evalast',
    logo_url: null,
  },

  // Both swatch assets are now approved_for_publication (confirmed live
  // 2026-07-31) — image_url wired here even though the current production
  // adapter (adaptStagedSystem.ts) doesn't populate it yet, per
  // SYSTEM_CARD_RENDERER_NOTES.md's own TODO.
  system_colours: [
    {
      colour_name: 'Arctic Birch',
      image_url: 'https://studio.buildquote.com.au/api/assets/f65dc37f-eb04-4bd4-8eb7-16538df4b765',
      sort_order: 1,
      is_stocked: true,
    },
    {
      colour_name: 'Himalayan Cedar',
      image_url: 'https://studio.buildquote.com.au/api/assets/89f078f3-d64a-4391-9a25-04c4c4d77000',
      sort_order: 2,
      is_stocked: true,
    },
  ],

  system_profiles: [
    {
      id: 'ae5893e5-be8e-4de1-87b6-868819424493',
      profile_name: 'Grooved both sides - Sculpted Grain',
      name: 'Grooved Board',
      product_code: null,
      description: null,
      dimensions: '190 x 24 mm',
      length_mm: 5450,
      width_mm: 190,
      height_mm: null,
      thickness_mm: 24,
      uom: 'length',
      supplier_pack_qty: null,
      supplier_pack_uom: null,
      sort_order: 1,
      weight_kg: 3.8,
    },
    {
      id: '8501a3fc-34a3-45b4-9bbb-ecb00b090b3b',
      profile_name: 'Rectangular profile - Sculpted Grain',
      name: 'Square Edge Board',
      product_code: null,
      description: null,
      dimensions: '190 x 24 mm',
      length_mm: 5450,
      width_mm: 190,
      height_mm: null,
      thickness_mm: 24,
      uom: 'length',
      supplier_pack_qty: null,
      supplier_pack_uom: null,
      sort_order: 2,
      weight_kg: 3.9,
    },
  ],

  system_components: [
    {
      id: '5ceeca49-f235-468b-a979-6d9971a1603d',
      role: 'Fastener - hidden clip',
      notes: null,
      sort_order: 0,
      components: {
        name: 'Chain Collated Clip & Screw - Timber Frame',
        sku: null,
        description: 'Hidden fastener for timber substructure. 6mm gap.',
        category: 'Fastener - hidden clip',
        uom: 'pack',
        procurement_route: null,
      },
    },
    {
      id: '913dc77b-5693-4ff8-a08f-df69a4a2b79e',
      role: 'Fastener - hidden clip',
      notes: null,
      sort_order: 1,
      components: {
        name: 'Chain Collated Clip & Screw - Metal Frame',
        sku: null,
        description: 'Hidden fastener for metal substructure.',
        category: 'Fastener - hidden clip',
        uom: 'pack',
        procurement_route: null,
      },
    },
    {
      id: 'fc2b1a67-cd41-4e32-860b-47086fbf50f7',
      role: 'Fastener - top fixing screw',
      notes: null,
      sort_order: 2,
      components: {
        name: 'Composite Decking Screw (CDS)',
        sku: null,
        description: 'Top-fix composite decking screw. T15 bit included.',
        category: 'Fastener - top fixing screw',
        uom: 'pack',
        procurement_route: null,
      },
    },
    {
      id: '53c4928f-7ce8-4aa6-9830-924730c1df78',
      role: 'Fastener - top fixing screw',
      notes: null,
      sort_order: 3,
      components: {
        name: 'Metal Frame Decking Screw (MDS)',
        sku: null,
        description: 'Top-fix decking screw for metal frames. TX20 bit included.',
        category: 'Fastener - top fixing screw',
        uom: 'pack',
        procurement_route: null,
      },
    },
    {
      id: '697430ac-f6e0-4bff-96f4-2bcabf17f21f',
      role: 'Fastener - tool accessory',
      notes: null,
      sort_order: 4,
      components: {
        name: 'Chain Hand Tool',
        sku: null,
        description: 'Hand tool for installing Chain collated clips - joist locator pin and depth-stopping bit. Sold separately.',
        category: 'Fastener - tool accessory',
        uom: 'each',
        procurement_route: null,
      },
    },
    {
      id: 'b05c546d-2dff-425e-bf8e-d8626e9fe42b',
      role: 'Fastener - tool accessory',
      notes: null,
      sort_order: 5,
      components: {
        name: 'Chain T15 Depth Bit',
        sku: null,
        description: 'Depth-controlling bit for the Chain hand tool. Sold separately.',
        category: 'Fastener - tool accessory',
        uom: 'pack',
        procurement_route: null,
      },
    },
  ],
}
