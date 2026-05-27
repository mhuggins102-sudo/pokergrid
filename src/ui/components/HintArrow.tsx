import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  // The popup's screen-space rect (top-left + width/height).
  popup: Rect;
  // The element the arrow points at.
  anchor: Rect;
  color: string;
}

// Find the point on a rect's boundary in the direction (dx, dy) from
// its center. Used to anchor the line at the popup's exit edge and
// the anchor's entry edge — gives a clean "popup → element" arrow that
// doesn't visually overlap either box.
const rectEdge = (
  cx: number, cy: number,
  hw: number, hh: number,
  dx: number, dy: number
) => {
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const tx = Math.abs(dx) > 0 ? hw / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
};

// Pointer-line + arrowhead from the popup's nearest edge to the
// anchor's nearest edge. Pure positional render — the parent owns both
// rects (measured in screen space) and just hands them down.
//
// The line is a rotated View; the arrowhead is a CSS-style triangle
// using border tricks (cross-platform on RN — react-native-svg would
// be cleaner but we don't depend on it elsewhere yet).
export const HintArrow = ({ popup, anchor, color }: Props) => {
  const popupCx = popup.x + popup.w / 2;
  const popupCy = popup.y + popup.h / 2;
  const anchorCx = anchor.x + anchor.w / 2;
  const anchorCy = anchor.y + anchor.h / 2;
  const dx = anchorCx - popupCx;
  const dy = anchorCy - popupCy;

  // If popup overlaps the anchor or both are at the same point, skip
  // the arrow — there's nothing to point at.
  if (dx === 0 && dy === 0) return null;

  const start = rectEdge(popupCx, popupCy, popup.w / 2, popup.h / 2, dx, dy);
  // The arrowhead end stops a few px short of the anchor edge so it
  // visually touches without overlapping the element it points to.
  const ANCHOR_GAP = 6;
  const end = rectEdge(anchorCx, anchorCy, anchor.w / 2 + ANCHOR_GAP, anchor.h / 2 + ANCHOR_GAP, -dx, -dy);

  const segDx = end.x - start.x;
  const segDy = end.y - start.y;
  const length = Math.hypot(segDx, segDy);
  // Too short to render meaningfully — popup and anchor are essentially
  // touching, so the arrow would be noise.
  if (length < 16) return null;
  const angle = Math.atan2(segDy, segDx);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  return (
    <>
      {/* Shaft — thin neon line, rotated around its midpoint. */}
      <View
        pointerEvents="none"
        style={[
          styles.shaft,
          {
            left: midX - length / 2,
            top: midY - 1,
            width: length,
            backgroundColor: color,
            shadowColor: color,
            transform: [{ rotate: `${angle}rad` }],
          },
        ]}
      />
      {/* Arrowhead — triangle pointing right in unrotated space, then
          rotated to the line's angle so it always tips toward the
          anchor. Uses border tricks for a solid filled triangle. */}
      <View
        pointerEvents="none"
        style={[
          styles.headWrap,
          {
            left: end.x - 8,
            top: end.y - 8,
            transform: [{ rotate: `${angle}rad` }],
          },
        ]}
      >
        <View
          style={[
            styles.headTri,
            { borderLeftColor: color, shadowColor: color },
          ]}
        />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  shaft: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  headWrap: {
    position: 'absolute',
    width: 16,
    height: 16,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  // Border-triangle trick: a 0×0 element with two transparent borders
  // and one colored border renders as a solid triangle pointing in the
  // colored direction. left-colored = points right.
  headTri: {
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
});
