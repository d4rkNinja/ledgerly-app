# Ledgerly brand system

## Fixed identity

The existing Ledgerly logo in `web/public/logo.svg` is locked. Its mark,
geometry, colors, wordmark treatment, proportions, and clear-space behavior must
not be redrawn or modified.

Ledgerly's interface direction is **Quiet Ledger**: calm, archival, precise, and
human. It should feel trustworthy enough for financial decisions without
looking like a traditional bank or a trend-led fintech template.

## Color

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#F3F5F1` | `#0C1410` |
| Surface | `#FAFBF8` | `#111C16` |
| Raised surface | `#FFFFFF` | `#17231C` |
| Inset surface | `#EBF0EB` | `#1C2A22` |
| Primary ink | `#17231C` | `#F0F5F1` |
| Secondary ink | `#59675F` | `#AAB7AE` |
| Hairline | `#D5DDD7` | `#2B3A31` |
| Action green | `#245F43` | `#86C39C` |
| Action soft | `#DFECE4` | `#193326` |
| Positive | `#1E7049` | `#78BD92` |
| Warning | `#825416` | `#EDBD72` |
| Danger | `#A3443E` | `#F2A29C` |

The action color and positive color must remain visually distinct. Status must
also use a label, sign, or icon so meaning never depends on color alone.

## Typography

- Manrope is the product typeface for controls, navigation, rows, labels, body
  copy, headings, and all financial values. Personality comes from proportion,
  weight, spacing, and composition rather than a decorative display face.
- Use one type family throughout the product. Display headings use Manrope
  `700–760`; section headings use `650–700`; body copy uses `400–500`.
- All amounts, percentages, dates, and chart labels use tabular numerals.
- Headings use balanced wrapping; body copy uses pretty wrapping.

## Shape and spacing

- Base spacing unit: `4px`.
- Primary spacing steps: `4, 8, 12, 16, 24, 32, 48, 64`.
- Page gutters: `16px` phone, `24px` tablet, `40px` desktop.
- Small controls: `8px` radius.
- Standard controls: `10px` radius.
- Cards and sections: `16px` radius.
- Dialogs and sheets: `20px` radius.
- Pills are reserved for filters, statuses, and compact segmented controls.

Ordinary content uses tonal separation and hairlines. Shadows are reserved for
menus, dialogs, sticky controls, and the primary financial hero.

## Motion

- Color and hover feedback: `140ms`.
- Small state changes and row expansion: `220ms`.
- Dialogs and sheets: `280ms`, up to `8px` of travel.
- Route entrance: `180–220ms`, opacity plus up to `6px` of travel.
- Press feedback: `translateY(1px) scale(0.985)` for wide controls and
  `scale(0.96)` for compact icon controls.

Frequent navigation and keyboard-driven actions do not animate. Reduced-motion
mode removes translation, scale, springs, stagger, and chart growth while
retaining immediate state and color feedback.

## Responsive behavior

- Desktop uses a quiet fixed rail and compact sticky top bar.
- Tablet and phone use an opaque, anchored bottom navigation bar.
- Dense finance layouts collapse to a single reading column before horizontal
  compression harms labels or amounts.
- Touch targets remain at least `44px` in both dimensions.
- Safe-area insets and dynamic viewport units are required for native shells.
