---
name: Widget Now
description: A crisp, glanceable workspace for turning live webpages into personal widgets.
colors:
  canvas: "#ffffff"
  ink: "#111111"
  surface: "#f3f3f3"
  surface-soft: "#f7f7f7"
  muted: "#666666"
  subdued: "#737373"
  border: "#e5e5e5"
  accent: "#2563eb"
  accent-strong: "#1d4ed8"
  accent-soft: "#eff6ff"
  danger: "#b42318"
  danger-soft: "#fff4f2"
typography:
  display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "clamp(34px, 4vw, 58px)"
    fontWeight: 650
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.7px"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "normal"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.08em"
rounded:
  sm: "6px"
  md: "8px"
  control: "10px"
  card: "14px"
  dialog: "17px"
  widget: "30px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "28px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 17px"
  button-primary-hover:
    backgroundColor: "#2a2a2a"
    textColor: "{colors.canvas}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 17px"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.canvas}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 22px"
    height: "50px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 17px"
  input-default:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "9px"
    padding: "11px 13px"
  card-default:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "26px"
---

# Design System: Widget Now

## Overview

**Creative North Star: "The Glanceable Instrument"**

Widget Now feels like a precise personal utility: quiet enough to keep data in charge, but confident enough to make each next action obvious. Pure white space, near-black type, light-grey surfaces, and a single clear blue accent create a crisp working canvas for content gathered from the web.

The system is compact rather than cramped. Small labels, economical controls, and firm alignment support quick scanning, while rounded widget silhouettes and restrained depth keep the product approachable. Individual widgets may carry their own theme colors; those colors belong to the content preview and do not redefine the application identity.

**Key Characteristics:**

- Pure-white working canvas with near-black interface ink.
- Blue reserved for active, linked, focused, and high-intent moments.
- Compact controls, crisp borders, and restrained ambient shadows.
- Rounded widgets are expressive; surrounding product chrome stays quieter.
- Responsive layouts simplify and stack without changing the visual voice.

## Colors

The palette is deliberately narrow: neutral structure carries the interface, while saturated blue marks progress and intent.

### Primary

- **Widget Blue:** The product accent for primary marketing actions, active navigation, selection, focus, and connected states.
- **Deep Widget Blue:** The stronger blue used for hover states and blue text that must remain legible on pale surfaces.

### Neutral

- **Pure Canvas:** The default page, card, field, and dialog surface.
- **Interface Ink:** The primary text color and the default filled-action color.
- **Soft Grey Surface:** The secondary-button and grouped-control surface.
- **Quiet Grey Surface:** A lighter hover, preview, and empty-state layer.
- **Muted Copy:** Supporting labels and low-emphasis control text.
- **Subdued Copy:** Explanatory text and tertiary metadata.
- **Crisp Border:** The standard divider and field stroke.
- **Blue Wash:** The selected, connected, and accent-supporting surface.
- **Danger Red / Danger Wash:** Destructive actions and their low-intensity message surface.

### Named Rules

**The One Accent Rule.** Application chrome uses Widget Blue as its only saturated brand accent; theme colors inside user widgets and source demonstrations remain content, not chrome.

**The White Stage Rule.** Pure Canvas is the default field. Grey surfaces identify grouping or state and never become a competing page background.

## Typography

**Display Font:** System sans (`-apple-system`, BlinkMacSystemFont, `Segoe UI`, sans-serif)

**Body Font:** System sans (`-apple-system`, BlinkMacSystemFont, `Segoe UI`, sans-serif)

**Character:** The type system is direct, compact, and native-feeling. Weight and tight tracking create hierarchy without introducing a decorative display family.

### Hierarchy

- **Display:** Tight, confident copy for the largest persuasive statement or transformation label.
- **Headline:** Page and section headings in a firm semibold voice.
- **Title:** Component titles and short card headings.
- **Body:** Concise instructions, descriptions, and working copy; long-form policy text may open the line height for reading.
- **Label:** Compact metadata, field hints, status text, and uppercase utility cues.

### Named Rules

**The Data Leads Rule.** Large type is reserved for a page-level idea or a value worth glancing at; interface explanation stays compact.

## Layout

Product screens sit inside a fluid workspace capped at 1400px, with percentage gutters that tighten on smaller viewports. Operative screens favor compact grids and aligned rows; persuasive surfaces may use a wider editorial composition while retaining the same header and control language.

Spacing follows a small rhythm built from 4px and 8px increments, with 12–18px internal gaps and 28–48px separation between major groups. At 850px, dense editor structures collapse into selected panels. At 620px, multi-column content stacks, headings shrink, gutters settle around 5%, and primary actions may become full width.

**The Scan Path Rule.** Layout should expose one clear reading or working path before adding secondary actions; responsive changes preserve that order rather than merely shrinking columns.

## Elevation & Depth

The system is flat by default and uses a hybrid of borders, tonal layering, and low-opacity ambient shadows. Fields and everyday rows rely on strokes; menus, dialogs, widgets, and intentionally lifted examples earn soft shadow. Hover lift is subtle and typically no more than a one- or two-pixel translation.

### Shadow Vocabulary

- **Control Lift** (`0 3px 7px #1111110c`): Minimal depth under filled primary controls.
- **Menu Lift** (`0 14px 30px #11111116`): Floating menus and transient panels.
- **Widget Lift** (`0 10px 22px #11111110`): Previews and saved widget surfaces.
- **Dialog Lift** (`0 26px 70px #11111136`): Modal content over a dimmed backdrop.

### Named Rules

**The Earned Elevation Rule.** Resting product surfaces stay flat; shadows identify a floating layer, a widget object, or a deliberate interactive lift.

## Shapes

Controls use compact, gently rounded corners: small utility elements sit around 6–8px, standard controls around 8–10px, and cards or dialogs around 14–17px. Circular geometry is reserved for dots, handles, directional controls, and other genuinely radial elements. Widget previews may use substantially larger radii because their silhouette belongs to the product's authored output.

**The Chrome Stays Compact Rule.** Do not import a widget's large corner radius into ordinary application controls or containers.

## Components

### Buttons

- **Shape:** Compact rounded rectangle with semibold, sentence-case copy.
- **Primary:** Near-black fill with white text for routine product actions.
- **Accent:** Widget Blue fill with white text for the principal persuasive or activation action.
- **Secondary:** Soft Grey Surface with a Crisp Border for reversible or lower-priority actions.
- **Hover / Focus:** Darken or strengthen the current fill, add restrained lift, and retain the three-pixel blue focus outline with a four-pixel offset.

### Chips

- **Style:** Compact rounded status surfaces using a pale neutral or Blue Wash background.
- **State:** Blue text identifies active or connected state; danger colors are reserved for error state.

### Cards / Containers

- **Corner Style:** Medium rounding for everyday cards; larger rounding only for dialogs and widget objects.
- **Background:** Pure Canvas, with Quiet Grey Surface used for previews and empty states.
- **Shadow Strategy:** Border-first; apply ambient lift only when the surface floats or represents a widget object.
- **Border:** One-pixel neutral strokes define most cards and rows.
- **Internal Padding:** Compact cards commonly use 12–18px; focused forms and dialogs use 22–32px.

### Inputs / Fields

- **Style:** White fill, one-pixel Crisp Border, gently rounded corners, and compact horizontal padding.
- **Focus:** Two-pixel Widget Blue outline with a one-pixel offset.
- **Error / Disabled:** Errors use Danger Red on Danger Wash; disabled controls reduce opacity without changing layout.

### Navigation

The header is a white, bottom-bordered bar with a compact wordmark, low-emphasis navigation, and blue active state. Navigation keeps its native text character and uses a thin blue bottom border rather than a filled tab. On smaller screens, labels and gaps tighten while the brand remains visible.

### Widget Previews

Widget previews are the expressive layer of the product. Their themes, colors, typography, and enlarged corner radii may vary with user authorship, while selection handles and editing overlays always return to the product's blue interaction language.

## Do's and Don'ts

### Do:

- **Do** use Pure Canvas, Interface Ink, and neutral borders as the default product frame.
- **Do** reserve Widget Blue for active, focused, linked, selected, or singular high-intent actions.
- **Do** keep controls compact and use spacing to separate groups rather than inflating every component.
- **Do** let widget content carry theme-specific color inside a stable application frame.
- **Do** stack responsive layouts in their original scan order and make the primary action easy to reach.

### Don't:

- **Don't** treat colors sampled from a source page or example widget as application brand colors.
- **Don't** apply strong shadows to ordinary resting cards, fields, or rows.
- **Don't** use large widget-style radii on standard application chrome.
- **Don't** introduce a second saturated accent for routine interface state.
- **Don't** make supporting explanation compete with values, previews, or the primary action.
