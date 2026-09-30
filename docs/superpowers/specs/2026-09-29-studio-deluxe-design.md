# Solitaire v1.2: Studio Deluxe, Visible Flip, No Mid-Game Auto-Moves

Date: 2026-09-29
Status: approved in brainstorming, pending written-spec review
Builds on: `docs/superpowers/specs/2026-09-29-premium-ui-design.md` (v1.1, live at https://solitaire.lukeghanna.com)
Mockups: `.superpowers/brainstorm/27323-1790723348/content/richness-v2.html` (option B) and `cards-b.html` (face 1, flip A, shake). These are git-ignored scratch files; this spec carries every value that binds.

## Goal

v1.1 reads as clean but too plain. v1.2 adds craft and depth to the table, the cards and the chrome. It also fixes three behaviours:

- The game makes moves on its own mid-game.
- The flip is too subtle to see.
- Clicking a card with nowhere to go gives no visual feedback.

Card readability, meaning the big corner index Luke picked for speed, is non-negotiable.

## 1. Tables

The three-table switch stays. Each table gains texture and depth. The textures are CSS only (gradients plus inline SVG `feTurbulence` noise as data-URI backgrounds), with no image files.

**Studio** (default; "Studio Deluxe"):
- **Base:** `radial-gradient(70% 60% at 50% 18%, #3a2c1d 0%, #1c1612 55%, #0f0d0b 100%)`, a warm spotlight from above.
- **Leather grain:** a noise overlay (`baseFrequency .55`, 4 octaves) with `mix-blend-mode: soft-light` and `opacity .35`.
- **Stitched rail:** a `1px dashed #f2c14e2e` border inset 10px from the table-area edges, with a 12px radius. It is decorative only (`pointer-events: none`).

**Felt:**
- **Base:** keeps the v1.1 green.
- **Woven texture:** a noise overlay (`baseFrequency .9`, 3 octaves, grey) with `mix-blend-mode: overlay` and `opacity .55`.
- **Vignette:** `box-shadow: inset 0 0 120px 30px #00000080` on the table area.

**Paper:**
- **Base:** keeps the v1.1 cream.
- **Linen weave:** `repeating-linear-gradient(0deg, #00000008 0 1px, transparent 1px 3px)` plus the same at 90deg (`#00000006`), plus a faint warm noise at `opacity .6`.

**Slots:**
- **Studio:** a recessed look, with fill `linear-gradient(180deg, #ffffff08, #ffffff02)` and `inset 0 1px 0 #ffffff0d`.
- **Felt:** `inset 0 2px 8px #00000055`.
- **Paper:** the v1.1 look is unchanged.

**Textures stay out of the way:**
- They sit on a pseudo-element behind the cards.
- They never intercept pointer events.
- They don't change layout.

## 2. Chrome

**Floating glass toolbar** (all tables):
- The bar sits inset from the viewport edges with `margin: 10px 12px 0`, `border-radius: 12px` and a `1px` border in the table's `--chrome-line`.
- Background: `linear-gradient(170deg, #ffffff17, #ffffff06)` on Studio and Felt. Paper keeps its light glass value.
- Shadow: `0 10px 30px #0006, 0 1px 0 #ffffff1f inset`. Paper's shadow is lighter: `0 8px 24px #0000001a`.
- Blur: `backdrop-filter: blur(12px) saturate(140%)`.
- Height stays 52px, and the v1.1 responsive rules still hold: one row down to 641px and a two-row readout below that.
- Wordmark on Studio: "Solitaire" followed by an amber period, `Solitaire<span>.</span>` with the period in `--accent`.

## 3. Cards

**Face.** Every one of the 52 cards gets the same layout: index top-left, one big pip bottom-right. Kings, queens and jacks show their letter only in the index; there is no big letter. This is v1.1's face made crisper and slightly larger:

| Property | v1.2 value |
|---|---|
| Face colour | `#fbf8f2` on Studio and Felt, `#ffffff` on Paper |
| Keyline | A `1px solid #0000000d` hairline inset `calc(var(--card-w) * 0.033)`, radius `calc(var(--card-w) * 0.043)` |
| Paper grain | A noise overlay (`baseFrequency 1.2`, warm grey) with `mix-blend-mode: multiply` and `opacity .18`, on faces only |
| Index position | `top: calc(var(--card-w) * 0.076)`, `left: calc(var(--card-w) * 0.076)`, column width `0.26 × w` |
| Rank | Geist 600, `font-size: calc(var(--card-w) * 0.26)`, `letter-spacing: -0.05em` |
| Suit under rank | `0.163 × w` square, `0.03 × w` gap |
| Big pip | `0.48 × w` square, `right: 0.087 × w`, `bottom: 0.087 × w` |
| Suit colours | Unchanged, and four-colour still works |

`paintFace` (the win-cascade canvas twin) gets the same proportions.

**Shadows.** At rest: `0 0 0 1px #00000014, 0 10px 22px #0000008c, 0 2px 5px #00000059`. On Paper: `0 0 0 1px #1b1a171f, 0 10px 22px #3a2a1426, 0 2px 4px #3a2a141f`. The lift shadow, the stacked-pile rule and the back shadow keep the v1.1 structure.

**New "Deco" back** becomes the new default `cardBack`:
- Background `linear-gradient(160deg, #3a2d1f, #1d160f)`.
- Frame `#f2c14e55`.
- Pattern `conic-gradient(from 45deg at 50% 50%, #f2c14e14 0 25%, transparent 0 50%, #f2c14e14 0 75%, transparent 0) 0 0 / 12px 12px`.
- A centred diamond medallion: a square of `0.33 × w`, rotated 45deg, with a `1px #f2c14eaa` border, filled `#1d160f`, plus an outer ring `0 0 0 4px #1d160f, 0 0 0 5px #f2c14e55`.

`CardBack` becomes `'deco' | 'amber' | 'ink' | 'oxblood' | 'navy'`, default `'deco'`. Existing stored backs are kept. Settings lists Deco first.

## 4. Motion

**Flip.** A real 3D turn replaces the crossfade:
- `.card` gets `perspective: calc(var(--card-w) * 10)`.
- `.card-inner` gets `transform-style: preserve-3d` and `transition: transform var(--flip-ms) var(--ease)`.
- A face-down card is `rotateY(180deg)`, with `backface-visibility: hidden` on the front and back faces.
- `FLIP_MS` changes to normal 240 / fast 150 / off 0. `MOVE_MS` and `FINISH_STEP_MS` are unchanged.
- To avoid a blank face showing during a face-down flip, `CardFront` renders for every card, not only face-up ones. The card's `aria-label` still says "face-down card" for face-down cards.

**"No move" shake.**
- **Trigger:** a tap or click on a card that has no legal destination (the path that calls `onReject` from a tap in `useTableInput`). The shake plays on the cards in that pickup: the tapped card plus everything above it in the column.
- **Motion:** `translateX` keyframes of `0, -3px, 2.5px, -1.5px, 1px, 0` over 220ms with `cubic-bezier(.36,.07,.19,.97)`, applied to `.card-inner`.
- **Sound and announcement:** the existing "nope" sound and announcement still play.
- **Exceptions:** there is no shake for rejected drags (those snap back) or keyboard rejects, and none when Animation is Off. Reduced motion still shakes, since the motion is tiny.
- **Repeats:** tapping the same card again replays the shake.

**Hover lift** (pointer devices only, `@media (hover: hover)`): a face-up card that can be picked up (per `pickupAt` in `src/ui/layout.ts`) lifts `translateY(-2px)` on its `.card-inner` over 160ms, and its shadow deepens slightly. It is off while dragging and while locked.

## 5. No automatic moves mid-game

- A new setting replaces `autoPlay`: `autoMove: boolean`, default `false`. `parseSettings` ignores the old `autoPlay` field, so everyone starts with it off, including Luke's current `true`.
- The Settings toggle is labelled "Auto-move safe cards to foundations", with the hint "Off: nothing moves unless you move it. The finish still completes itself."
- Auto-finish (all cards face up) is unchanged and always on.
- The foundation-bounce protection from v1.1 stays, for players who opt in.

## 6. Testing

**Unit:**
- Settings: `autoMove` defaults to false, and a stored `autoPlay: true` still gives `autoMove: false`. `cardBack` defaults to `deco` and accepts all five values.
- `FLIP_MS` values.
- `CardFront` still renders the index and one big pip for all 52 cards, including courts.

**E2E:**
- On a fresh profile, a legal move produces exactly that move, with no extra foundation moves in the same turn.
- Tapping a card with no legal move adds the `nope` class to it (and to the cards above it), and nothing moves.
- A legal tap does not add `nope`.
- The table and back switches still persist.
- The existing suites pass.

**Visual:** review screenshots of all three tables on desktop and phone before merge, plus a manual look at a flip and a shake in the browser pane.

## Out of scope

- Pip layouts or court art on the card face.
- Serif typography.
- Sound redesign.
- A foundation-complete flourish.
