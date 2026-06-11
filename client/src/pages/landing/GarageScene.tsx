import { PALETTE } from "./palette";

/**
 * The hero illustration: a flat-geometric suburban Phoenix garage scene.
 * Authored as inline JSX SVG — every junk item is a <g> with a stable id so
 * the GSAP timeline (useGarageTimeline) can fly each one into the truck.
 *
 * Z-order matters: junk items draw BEFORE the truck so they vanish behind the
 * green box when they land, and the door draws AFTER the items (clipped to
 * the opening) so rolling it up reveals the clutter.
 */

const P = PALETTE;

/** Garage opening (the door is clipped to this). */
export const OPENING = { x: 100, y: 240, width: 480, height: 320 } as const;

/** Where flying items land (center of the truck bed). */
export const TRUCK_BED = { x: 980, y: 430 } as const;

export type JunkWeight = "light" | "medium" | "heavy";

export type JunkItemSpec = {
  id: string;
  /** Launch point — the item's resting center in the pile. */
  cx: number;
  cy: number;
  weight: JunkWeight;
};

/**
 * Fly-out order: top of the pile leaves first, the heavy floor items go last.
 * Weight drives arc shape + speed in the timeline (heavy = slow, low, flat).
 */
export const JUNK_ITEMS: JunkItemSpec[] = [
  { id: "junk-microwave", cx: 287, cy: 267, weight: "light" },
  { id: "junk-boxes", cx: 288, cy: 350, weight: "light" },
  { id: "junk-paint", cx: 350, cy: 525, weight: "light" },
  { id: "junk-lamp", cx: 558, cy: 440, weight: "light" },
  { id: "junk-tv", cx: 157, cy: 335, weight: "medium" },
  { id: "junk-chair", cx: 425, cy: 510, weight: "light" },
  { id: "junk-bicycle", cx: 215, cy: 505, weight: "medium" },
  { id: "junk-tires", cx: 487, cy: 500, weight: "medium" },
  { id: "junk-rug", cx: 532, cy: 445, weight: "medium" },
  { id: "junk-mattress", cx: 437, cy: 450, weight: "heavy" },
  { id: "junk-sofa", cx: 295, cy: 490, weight: "heavy" },
  { id: "junk-fridge", cx: 157, cy: 460, weight: "heavy" },
];

/** Full scene + the tighter phone crop (garage + truck centered). */
export const VIEWBOX_DESKTOP = "0 0 1200 675";
export const VIEWBOX_MOBILE = "80 160 1120 515";

export function GarageScene({
  mobileCrop = false,
  staticFinal = false,
}: {
  /** Use the tighter phone viewBox crop. */
  mobileCrop?: boolean;
  /** prefers-reduced-motion: render the swept-clean end state, no animation. */
  staticFinal?: boolean;
}) {
  const doorOpenOffset = staticFinal ? -(OPENING.height + 12) : 0;

  return (
    <svg
      viewBox={mobileCrop ? VIEWBOX_MOBILE : VIEWBOX_DESKTOP}
      className="h-full w-full"
      role="img"
      aria-label="A garage full of junk being loaded into a green Rejunk box truck outside a Phoenix home"
      id="garage-scene"
    >
      <defs>
        <clipPath id="garage-opening-clip">
          <rect x={OPENING.x} y={OPENING.y - 4} width={OPENING.width} height={OPENING.height + 4} />
        </clipPath>
      </defs>

      {/* ── Sky + ground ─────────────────────────────────────────────── */}
      <rect x="0" y="0" width="1200" height="560" fill={P.sky} />
      <rect x="0" y="430" width="1200" height="130" fill={P.sand} opacity="0.55" />
      <rect x="0" y="560" width="1200" height="115" fill={P.sandDeep} />

      {/* ── Desert accents ───────────────────────────────────────────── */}
      <g id="scene-saguaro">
        <ellipse cx="1158" cy="565" rx="26" ry="7" fill={P.charcoal} opacity="0.08" />
        <rect x="1150" y="468" width="17" height="96" rx="8" fill={P.cactus} />
        <rect x="1128" y="492" width="13" height="36" rx="6.5" fill={P.cactus} />
        <rect x="1128" y="500" width="24" height="13" rx="6" fill={P.cactus} />
        <rect x="1172" y="478" width="13" height="30" rx="6.5" fill={P.cactus} />
        <rect x="1162" y="486" width="23" height="13" rx="6" fill={P.cactus} />
      </g>
      <ellipse cx="680" cy="566" rx="32" ry="14" fill={P.stuccoShade} />
      <ellipse cx="722" cy="571" rx="19" ry="9" fill={P.stuccoShade} opacity="0.7" />

      {/* ── House facade (wall drawn as bands around the opening) ────── */}
      <g id="scene-house">
        {/* parapet + flat roof line */}
        <rect x="0" y="140" width="760" height="26" fill={P.stuccoShade} />
        <rect x="0" y="160" width="760" height="8" fill={P.charcoal} opacity="0.18" />
        {/* wall above / left / right of the opening */}
        <rect x="0" y="166" width="760" height={OPENING.y - 166} fill={P.stucco} />
        <rect x="0" y={OPENING.y} width={OPENING.x} height="320" fill={P.stucco} />
        <rect x={OPENING.x + OPENING.width} y={OPENING.y} width={760 - OPENING.x - OPENING.width} height="320" fill={P.stucco} />
        {/* window on the right wall */}
        <rect x="628" y="300" width="96" height="92" fill={P.stuccoShade} />
        <rect x="636" y="308" width="80" height="76" fill="#f8f3e6" />
        <rect x="672" y="308" width="8" height="76" fill={P.stuccoShade} />
      </g>

      {/* ── Garage interior + clutter (revealed by the door) ─────────── */}
      <rect x={OPENING.x} y={OPENING.y} width={OPENING.width} height={OPENING.height} fill={P.garageDark} />

      {!staticFinal && (
        <g id="scene-junk">
          {/* fridge — heavy, sits on the floor */}
          <g id="junk-fridge">
            <rect x="115" y="370" width="85" height="188" rx="6" fill="#e8e4da" />
            <line x1="115" y1="432" x2="200" y2="432" stroke={P.charcoal} strokeWidth="4" opacity="0.35" />
            <rect x="186" y="386" width="6" height="34" rx="3" fill={P.charcoal} opacity="0.5" />
            <rect x="186" y="444" width="6" height="44" rx="3" fill={P.charcoal} opacity="0.5" />
          </g>
          {/* old TV stacked on the fridge */}
          <g id="junk-tv">
            <rect x="118" y="300" width="78" height="68" rx="6" fill={P.charcoal} />
            <rect x="126" y="308" width="50" height="52" rx="4" fill="#9db3a8" />
            <circle cx="186" cy="318" r="4" fill={P.amber} />
            <circle cx="186" cy="334" r="4" fill={P.amber} />
          </g>
          {/* sectional sofa — heavy */}
          <g id="junk-sofa">
            <rect x="205" y="430" width="180" height="42" rx="8" fill={P.terracotta} />
            <rect x="205" y="468" width="180" height="88" rx="10" fill={P.terracotta} />
            <rect x="196" y="452" width="26" height="104" rx="10" fill="#b65f3d" />
            <rect x="368" y="452" width="26" height="104" rx="10" fill="#b65f3d" />
            <line x1="295" y1="472" x2="295" y2="552" stroke="#b65f3d" strokeWidth="5" />
          </g>
          {/* stacked moving boxes (group of 3) on the sofa */}
          <g id="junk-boxes">
            <rect x="250" y="375" width="76" height="56" rx="3" fill="#d9b072" />
            <rect x="262" y="322" width="66" height="54" rx="3" fill="#cfa055" />
            <rect x="256" y="375" width="64" height="10" fill="#c2945a" />
            <line x1="288" y1="322" x2="288" y2="376" stroke="#b8853e" strokeWidth="6" />
            <line x1="286" y1="375" x2="286" y2="431" stroke="#c2945a" strokeWidth="6" />
            <rect x="296" y="300" width="44" height="34" rx="3" fill="#d9b072" transform="rotate(-6 318 317)" />
          </g>
          {/* microwave on top of the boxes */}
          <g id="junk-microwave">
            <rect x="258" y="250" width="58" height="36" rx="4" fill={P.charcoal} />
            <rect x="264" y="256" width="34" height="24" rx="2" fill="#5b574e" />
            <circle cx="307" cy="262" r="3" fill={P.amber} />
          </g>
          {/* mattress leaning on the sofa — heavy */}
          <g id="junk-mattress" transform="rotate(8 437 450)">
            <rect x="402" y="352" width="70" height="196" rx="12" fill="#ece5d4" />
            <line x1="402" y1="412" x2="472" y2="412" stroke={P.stuccoShade} strokeWidth="4" />
            <line x1="402" y1="472" x2="472" y2="472" stroke={P.stuccoShade} strokeWidth="4" />
          </g>
          {/* broken chair */}
          <g id="junk-chair">
            <rect x="398" y="468" width="50" height="12" rx="4" fill="#b65f3d" />
            <rect x="398" y="424" width="12" height="50" rx="4" fill="#b65f3d" />
            <rect x="402" y="480" width="9" height="56" fill="#b65f3d" />
            <rect x="436" y="480" width="9" height="50" fill="#b65f3d" transform="rotate(14 440 480)" />
          </g>
          {/* paint cans (group) */}
          <g id="junk-paint">
            <rect x="328" y="520" width="28" height="36" rx="3" fill="#cfc7b6" />
            <rect x="358" y="520" width="28" height="36" rx="3" fill="#cfc7b6" />
            <rect x="343" y="486" width="28" height="36" rx="3" fill="#cfc7b6" />
            <rect x="343" y="484" width="28" height="7" rx="3" fill={P.amber} />
            <rect x="328" y="518" width="28" height="7" rx="3" fill={P.terracotta} />
            <rect x="358" y="518" width="28" height="7" rx="3" fill={P.moss} />
          </g>
          {/* bicycle in front */}
          <g id="junk-bicycle">
            <circle cx="180" cy="524" r="29" fill="none" stroke={P.charcoal} strokeWidth="6" />
            <circle cx="252" cy="524" r="29" fill="none" stroke={P.charcoal} strokeWidth="6" />
            <path d="M180 524 L206 478 L238 478 L252 524 L206 524 Z" fill="none" stroke={P.moss} strokeWidth="6" strokeLinejoin="round" />
            <line x1="200" y1="470" x2="216" y2="470" stroke={P.moss} strokeWidth="6" strokeLinecap="round" />
          </g>
          {/* two tires */}
          <g id="junk-tires">
            <circle cx="487" cy="524" r="31" fill={P.charcoal} />
            <circle cx="487" cy="524" r="13" fill={P.garageDark} />
            <circle cx="487" cy="468" r="29" fill={P.charcoal} />
            <circle cx="487" cy="468" r="12" fill={P.garageDark} />
          </g>
          {/* rolled rug leaning in the corner */}
          <g id="junk-rug" transform="rotate(-12 532 445)">
            <rect x="515" y="330" width="34" height="226" rx="16" fill={P.terracotta} />
            <circle cx="532" cy="346" r="13" fill="#b65f3d" />
            <circle cx="532" cy="346" r="6" fill={P.garageDark} />
          </g>
          {/* floor lamp */}
          <g id="junk-lamp">
            <rect x="554" y="372" width="7" height="178" fill={P.charcoal} />
            <path d="M540 372 L575 372 L568 336 L547 336 Z" fill={P.amber} />
            <rect x="544" y="548" width="28" height="8" rx="4" fill={P.charcoal} />
          </g>
        </g>
      )}

      {/* dust puffs — two circles per item, fired at each launch point */}
      {!staticFinal && (
        <g id="scene-dust">
          {JUNK_ITEMS.map(item => (
            <g key={item.id} id={`dust-${item.id}`}>
              <circle cx={item.cx - 14} cy={item.cy + 14} r="11" fill="#d8c9a8" opacity="0" />
              <circle cx={item.cx + 12} cy={item.cy + 20} r="16" fill="#d8c9a8" opacity="0" />
            </g>
          ))}
        </g>
      )}

      {/* ── Box truck, rear facing the garage ────────────────────────── */}
      <g id="scene-truck">
        <ellipse cx="1000" cy="572" rx="180" ry="12" fill={P.charcoal} opacity="0.08" />
        {/* box */}
        <rect x="850" y="290" width="270" height="245" rx="6" fill={P.pine} />
        <rect x="850" y="300" width="12" height="225" fill={P.garageDark} />
        <text
          x="992"
          y="412"
          textAnchor="middle"
          fontFamily="'Space Grotesk', 'Manrope', sans-serif"
          fontWeight="700"
          fontSize="40"
          letterSpacing="5"
          fill="#f3f7e9"
        >
          REJUNK
        </text>
        <rect x="862" y="508" width="258" height="6" fill={P.lime} opacity="0.85" />
        {/* cab silhouette */}
        <path d="M1120 420 L1178 420 L1196 462 L1196 535 L1120 535 Z" fill="#0a3d36" />
        <path d="M1158 428 L1176 428 L1189 460 L1158 460 Z" fill="#f8f3e6" opacity="0.85" />
        {/* liftgate — lowered platform, hinged at the rear sill */}
        <g id="scene-liftgate">
          <rect x="782" y="524" width="68" height="12" rx="3" fill="#b9b3a4" />
          <rect x="782" y="524" width="10" height="12" fill="#9a9485" />
        </g>
        {/* wheels */}
        <circle cx="930" cy="545" r="30" fill={P.charcoal} />
        <circle cx="930" cy="545" r="11" fill={P.sandDeep} />
        <circle cx="1075" cy="545" r="30" fill={P.charcoal} />
        <circle cx="1075" cy="545" r="11" fill={P.sandDeep} />
        <circle cx="1160" cy="545" r="28" fill={P.charcoal} />
        <circle cx="1160" cy="545" r="10" fill={P.sandDeep} />
      </g>

      {/* ── The roll-up door (clipped to the opening, slides up) ─────── */}
      <g clipPath="url(#garage-opening-clip)">
        <g id="scene-door" transform={staticFinal ? `translate(0 ${doorOpenOffset})` : undefined}>
          {[0, 1, 2, 3, 4, 5].map(index => (
            <rect
              key={index}
              x={OPENING.x}
              y={OPENING.y + index * (OPENING.height / 6)}
              width={OPENING.width}
              height={OPENING.height / 6 - 3}
              fill={P.door}
              stroke={P.doorLine}
              strokeWidth="1.5"
            />
          ))}
          <text
            x={OPENING.x + OPENING.width / 2}
            y="412"
            textAnchor="middle"
            fontFamily="'Space Grotesk', 'Manrope', sans-serif"
            fontWeight="800"
            fontSize="52"
            letterSpacing="10"
            fill={P.pine}
          >
            REJUNK
          </text>
          {/* handle */}
          <rect x={OPENING.x + OPENING.width / 2 - 22} y="528" width="44" height="8" rx="4" fill={P.doorLine} />
        </g>
      </g>

      {/* door trim frame */}
      <rect
        x={OPENING.x - 7}
        y={OPENING.y - 7}
        width={OPENING.width + 14}
        height={OPENING.height + 14}
        fill="none"
        stroke={P.stuccoShade}
        strokeWidth="14"
      />
    </svg>
  );
}
