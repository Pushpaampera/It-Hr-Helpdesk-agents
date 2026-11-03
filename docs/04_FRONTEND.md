# 04 — Frontend

Updated as of Phase 1. Populated fully from Phase 5 onward (design system + 3D building blocks).

## Routes (Phase 1 state)
| Path | Page | Notes |
|------|------|-------|
| `/` | `PlaceholderHome` | Temporary: live-pings `/api/health` to prove the stack is wired end to end. Replaced by the cinematic landing page in Phase 6. |

## Structure
- `src/main.tsx` — React root, wraps `<App>` in `<BrowserRouter>`, imports `design/global.css`.
- `src/App.tsx` — renders `<AppRoutes>`.
- `src/routes.tsx` — `react-router-dom` route table.
- `src/design/tokens.css` — CSS variables: base surface colors (`--bg: #05060f` dark "AI
  operations room"), the 8 agent identity colors (Supervisor violet `#8B5CF6`, IT cyan
  `#22D3EE`, HR pink `#F472B6`, Action amber `#FBBF24`, Ticketing coral `#FB7185`, Feedback
  green `#34D399`, Knowledge blue `#60A5FA`, Guard red `#F87171`), typography
  (`--font-heading`/`--font-body`/`--font-mono`), spacing/radius/shadow/motion scales, and a
  `[data-reduce-motion="true"]` global override.
- `src/design/global.css` — font imports (`@fontsource`, installed locally, no network font
  loading), base element resets, `.glass-panel` utility class.
- `src/design/motion.ts` — shared Framer Motion variants (`fadeUp`, `fadeIn`, `scaleIn`,
  `staggerContainer`, `slideInRight`) and `prefersReducedMotion()`.
- `src/pages/PlaceholderHome.tsx` — only page so far.

## Design tokens already decided (ahead of Phase 5, so later phases don't redo this)
Dark background `#05060F`, glassmorphism panels (`.glass-panel`: translucent + blurred + 1px
subtle border + panel shadow), agent colors as above. 3D components, animation specs, and the
event→animation mapping are documented here starting Phase 5.
