---
version: "alpha"
name: "Kiss AI Default Design"
description: "A calm, source-forward visual identity for the project."
colors:
  primary: "#17202A"
  secondary: "#5D6D7E"
  accent: "#A45C40"
  background: "#F8F6F1"
  surface: "#FFFFFF"
  warning: "#9A6B1F"
  success: "#2F6F4E"
  annotation: "#6D5BD0"
  border: "#D8D2C4"
  on-primary: "#FFFFFF"
  on-accent: "#FFFFFF"
typography:
  h1:
    fontFamily: "Inter"
    fontSize: "2.75rem"
    fontWeight: "700"
    lineHeight: "1.1"
  h2:
    fontFamily: "Inter"
    fontSize: "1.6rem"
    fontWeight: "700"
    lineHeight: "1.2"
  body:
    fontFamily: "Inter"
    fontSize: "1rem"
    fontWeight: "400"
    lineHeight: "1.6"
  label:
    fontFamily: "Inter"
    fontSize: "0.78rem"
    fontWeight: "700"
    letterSpacing: "0.08em"
rounded:
  sm: "6px"
  md: "12px"
  lg: "20px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  annotation-callout:
    backgroundColor: "#F1EEFF"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "16px"
---

## Overview

The interface should feel calm, sober, and research-oriented. It should support careful judgment rather than urgency, with strong readability, restrained color, and clear source/status cues.

## Colors

- **Primary (#17202A):** Deep ink for headings, primary text, and important labels.
- **Secondary (#5D6D7E):** Muted slate for metadata, secondary text, and supporting context.
- **Accent (#A45C40):** Warm copper for primary actions and key interaction affordances.
- **Background (#F8F6F1):** Warm paper tone for the main workspace.
- **Annotation (#6D5BD0):** Distinct purple used only for human annotations on AI-managed content.

## Typography

Use a clean sans-serif with strong hierarchy. Headings should be direct and readable. Body copy should prioritize scanning long research pages and status summaries.

## Layout

Prefer a dashboard-like layout with a persistent navigation column, compact status cards, and large reading/editing panes. Keep line lengths comfortable for Markdown review.

## Components

Primary buttons should be warm and restrained. Annotation callouts must be visually distinct from requirement editing, because annotation edits are guidance for the next rebuild rather than direct source-of-truth changes.

## Do's and Don'ts

- Do make source freshness, blocked states, and annotation mode visible.
- Do keep research outputs calm, readable, and easy to review.
- Do not make the interface feel like a trading terminal or urgent alerting system.
- Do not use the annotation color for ordinary navigation or decoration.
