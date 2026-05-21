---
name: Wildlife Monitoring System
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#414844'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#717973'
  outline-variant: '#c1c8c2'
  surface-tint: '#3f6653'
  primary: '#012d1d'
  on-primary: '#ffffff'
  primary-container: '#1b4332'
  on-primary-container: '#86af99'
  inverse-primary: '#a5d0b9'
  secondary: '#57615c'
  on-secondary: '#ffffff'
  secondary-container: '#d8e2dc'
  on-secondary-container: '#5b6560'
  tertiary: '#002d1a'
  on-tertiary: '#ffffff'
  tertiary-container: '#1a432e'
  on-tertiary-container: '#84b095'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c1ecd4'
  primary-fixed-dim: '#a5d0b9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#274e3d'
  secondary-fixed: '#dbe5df'
  secondary-fixed-dim: '#bfc9c3'
  on-secondary-fixed: '#151d1a'
  on-secondary-fixed-variant: '#3f4945'
  tertiary-fixed: '#c0edd0'
  tertiary-fixed-dim: '#a4d1b4'
  on-tertiary-fixed: '#002112'
  on-tertiary-fixed-variant: '#264f39'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  title-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  data-numeric:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: -0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style

This design system is built for precision, ecological stewardship, and scientific clarity. The brand personality is **observational, dependable, and serene**, evoking the quiet authority of a forest ranger. It targets researchers and conservationists who require high-density information without cognitive fatigue.

The visual style is a refined **Minimalism** blended with **Corporate Modern** sensibilities. It prioritizes content through a high-contrast hierarchy and expansive white space, ensuring that critical wildlife data remains the focal point. The interface feels like a sophisticated digital field journal—functional, professional, and deeply rooted in its environmental context.

## Colors

The palette is derived from old-growth forests and misty mornings. **Deep Forest Green (#1B4332)** serves as the primary anchor, used for brand elements, primary actions, and critical headings to establish authority. **Soft Sage (#D8E2DC)** provides a natural, low-contrast bridge for secondary containers and UI backgrounds, reducing eye strain during long monitoring sessions. 

The background uses a **Clean Off-White (#F8F9FA)** to maintain a "paper-like" professional quality. For functional alerts, we use desaturated earth-toned variants of red and gold to ensure they stand out against the green-centric palette without feeling jarring.

## Typography

The design system utilizes **Inter** for its exceptional legibility and neutral, technical character. Typography is structured to handle Spanish text lengths, which often exceed English counterparts; therefore, we prioritize generous line heights and slightly tighter letter-spacing for headlines.

**Data-numeric** styles are specifically optimized for quick scanning of species counts and confidence percentages. **Label-caps** are used for metadata and categorical headers (e.g., "PANEL PRINCIPAL") to provide a clear structural framework without competing with primary data.

## Layout & Spacing

The system employs a **12-column fluid grid** for desktop, transitioning to a **4-column layout** for mobile devices. The rhythm is based on an **8px linear scale**, ensuring consistent alignment across all components.

- **Desktop:** 48px outer margins with 24px gutters. Use wide gutters to maintain the minimalist "breathable" feel.
- **Tablet:** 32px outer margins with 20px gutters.
- **Mobile:** 16px outer margins. Headers scale down to `headline-lg-mobile` to maintain hierarchy within narrow viewports.

Information density should remain medium-low in dashboards to prevent "data noise," using the `lg` (40px) spacing unit to separate major content sections.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Ambient Shadows**. Surfaces do not "float" aggressively; instead, they sit subtly above the ground plane.

- **Level 0 (Background):** Off-white (#F8F9FA).
- **Level 1 (Cards/Containers):** Pure White (#FFFFFF) with a very soft, diffused shadow (0px 4px 20px rgba(27, 67, 50, 0.04)). This shadow uses a green-tinted neutral to harmonize with the primary color.
- **Level 2 (Modals/Popovers):** Pure White (#FFFFFF) with a more defined shadow (0px 12px 32px rgba(27, 67, 50, 0.08)).

We avoid heavy borders, opting instead for 1px strokes in Soft Sage (#D8E2DC) to define boundaries where tonal contrast is insufficient.

## Shapes

The design system uses a **Rounded (Level 2)** shape language to soften the technical nature of the monitoring data. 

- **Standard Elements (Buttons, Inputs):** 8px (0.5rem) corner radius.
- **Content Containers (Cards, Data Blocks):** 16px (1rem) corner radius.
- **Large Sections/Modals:** 24px (1.5rem) corner radius.

This geometry creates an approachable yet structured aesthetic that feels modern and organic, mirroring the natural subject matter of the application.

## Components

### Buttons
- **Primary:** Deep Forest Green background with white text. High-contrast and bold.
- **Secondary:** Soft Sage background with Deep Forest Green text. Used for less critical actions.
- **Ghost:** Transparent background with a 1px Sage border.

### Cards (Tarjetas)
Cards are the primary vehicle for wildlife detections. They should feature a 16px corner radius, a subtle Level 1 shadow, and a 1px Sage border. Use internal padding of 24px (md) to ensure data doesn't feel cramped.

### Chips (Indicadores)
Used for species categories or confidence levels. 
- **Confidence High:** Light green background (#B7E4C7) with Forest Green text.
- **Priority:** Pale amber background with dark brown text to signal attention.
- Chips should be fully rounded (pill-shaped).

### Input Fields
Inputs use a white background with a 1px Sage border. On focus, the border transitions to Primary Green with a subtle 2px outer glow in Sage. Labels sit above the field in `label-caps` style.

### Data Lists
Lists for "Detecciones recientes" should use horizontal dividers in Soft Sage (#D8E2DC). Each row should have a subtle hover state—a slight background shift to Sage at 20% opacity—to improve row tracking.