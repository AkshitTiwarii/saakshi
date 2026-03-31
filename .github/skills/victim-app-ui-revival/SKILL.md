---
name: victim-app-ui-revival
description: 'Upgrade victim-support app UI from generic AI-looking screens to a warm, cozy, trauma-informed experience. Use when redesigning React, Vite, or React Native screens, improving visual hierarchy, accessibility, emotional safety, and consistent component styling.'
argument-hint: 'Provide target screens, platform (web/mobile/both), and any brand colors or constraints'
user-invocable: true
disable-model-invocation: false
---

# Victim App UI Revival

## Outcome
Ship emotionally safe, high-trust UI improvements for victim-facing experiences that feel human, calm, and intentional rather than templated or AI-generic.

Default profile for this skill:
- Platform: both web and mobile
- Mood: soft earthy palette (sand, terracotta, sage)
- Delivery: workflow plus starter design token templates

## Use When
- The app feels visually flat, cold, repetitive, or "AI-sloppy".
- Screens do not reflect warmth, dignity, and safety for vulnerable users.
- Components look inconsistent across flows (buttons, cards, forms, nav, headers).
- You need a repeatable process to redesign screens without breaking functionality.

## Inputs To Collect
1. Platform scope: web, mobile, or both.
2. Screen scope: specific files and user journeys to redesign first.
3. Brand constraints: colors, typography, logo, legal copy, localization.
4. Accessibility constraints: language, contrast requirements, motion sensitivity.
5. Technical constraints: existing design system, component library, deadlines.

## Bundled Starter Assets
1. Web CSS tokens: [soft-earthy-tokens.css](./assets/soft-earthy-tokens.css)
2. Mobile TypeScript tokens: [softEarthyTokens.ts](./assets/softEarthyTokens.ts)
3. UI audit checklist: [ui-audit-checklist.md](./references/ui-audit-checklist.md)

## Workflow

### 1. Experience Audit (Current State)
1. Map primary victim journeys (onboarding, reporting, evidence upload, support, follow-up).
2. Identify UI pain points:
   - low contrast or readability
   - mechanical language tone
   - crowded layouts and weak hierarchy
   - inconsistent spacing/type scale
   - intimidating form interactions
3. Score each screen quickly: Trust, Clarity, Warmth, Accessibility (1-5).
4. Prioritize highest-risk screens first (where confusion could block help-seeking).

### 2. Visual Direction (Warm + Cozy + Respectful)
1. Define emotional design principles:
   - calm before clever
   - gentle guidance over dense instruction
   - dignity-first copy and microcopy
2. Set a clear visual system:
   - color tokens for calm surfaces, safe actions, critical alerts
   - typography scale with expressive but readable headings
   - spacing and radius tokens for soft, consistent surfaces
3. Avoid generic defaults:
   - no flat, single-color blank backgrounds
   - no interchangeable card grids with stock spacing
   - no purple-on-white default palette unless brand-mandated

### 3. Component Refactor (Systematic)
1. Standardize core primitives first:
   - primary and secondary buttons
   - input fields and validation states
   - cards, callouts, progress states, empty states
2. Ensure each component has:
   - default, pressed, disabled, loading states
   - clear focus styles and accessible touch targets
   - helper text with supportive, non-judgmental tone
3. Replace one-off style blocks with shared tokens/utilities.

### 4. Screen Redesign (Journey-Driven)
1. Redesign screen-by-screen in priority order.
2. For each screen:
   - simplify top section to one clear emotional anchor
   - chunk content into calm, digestible sections
   - preserve user context with progress and reassurance text
3. Add meaningful motion only when it helps orientation:
   - subtle stagger/reveal for new sections
   - state transitions that confirm safety and progress
   - respect reduced-motion settings

### 5. Accessibility + Safety Validation
1. Verify contrast, font scaling, keyboard/focus traversal, and screen-reader labels.
2. Check copy for trauma-aware language:
   - avoid blame, urgency panic, or shaming phrasing
   - use supportive action language
3. Confirm flows are recoverable:
   - clear back paths
   - autosave or draft where possible
   - explicit success and failure feedback

### 6. Quality Gates (Done Criteria)
A redesign is complete only if all are true:
1. Visual consistency across redesigned screens is obvious.
2. Users can complete primary tasks with fewer confusing moments.
3. Accessibility checks pass for text, controls, and navigation.
4. UI feels warm and intentional, not template-generated.
5. Existing functionality and data flow remain intact.

## Decision Branches
- If an existing design system is strong: extend it, do not replace it.
- If web and mobile diverge: keep shared design tokens, adapt layout patterns per platform.
- If timeline is short: ship a "Foundation Pass" (tokens + primitives + top 3 high-impact screens) before full rollout.
- If sensitive legal or policy text exists: preserve legal meaning, improve layout and readability only.

## Execution Pattern
1. Inspect target files and shared theme/component files first.
2. Start from bundled token files, then align with project naming and architecture.
3. Implement smallest coherent batch that improves a full journey.
4. Validate for regressions and accessibility.
5. Document what changed and what remains.

## Example Prompts
- /victim-app-ui-revival Redesign Dashboard and Capture flows for mobile with a warm, calm style. Keep current functionality.
- /victim-app-ui-revival Improve web app screens in src/components for trust and accessibility. Start with token system and buttons.
- /victim-app-ui-revival Do a Foundation Pass for both web and mobile in two phases, with highest-risk screens first.
