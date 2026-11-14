/**
 * What leaves a narrow fixed toolbar for «More» (Atlas frame 31). The bar keeps its order; when
 * it is too narrow, whole units leave it, the least needed first, and «More» holds them in the
 * bar's order, a row of groups per line. Pure: widths come in, a plan comes out.
 */

/** Tools that stay together: they leave the bar, and come back, as one. */
export interface ToolUnit {
  id: string;
  /** The bar's group the unit belongs to; a separator stands between groups. */
  group: string;
  /** Lower leaves first; units of one priority leave together. `Infinity` never leaves. */
  priority: number;
  /** Stands at the end of the bar, after the free space (¶, host tools). */
  end?: boolean;
}

/** The bar's geometry in px: the gap between items, a separator with its margins, «More». */
export interface BarMetrics {
  gap: number;
  separator: number;
  more: number;
}

export interface OverflowPlan {
  /** Units in «More». */
  hidden: ReadonlySet<string>;
  /** «More» line by line: rows of groups of units, in the bar's order. */
  rows: ToolUnit[][][];
  /** Even the tools that never leave do not fit: the bar scrolls sideways. */
  cramped: boolean;
}

export const NO_OVERFLOW: OverflowPlan = { hidden: new Set(), rows: [], cramped: false };

const widthOf = (widths: ReadonlyMap<string, number>, unit: ToolUnit) => widths.get(unit.id) ?? 0;

/** The width the bar needs with `shown` units, «More» included when any unit is left out. */
export function barWidth(
  units: readonly ToolUnit[],
  widths: ReadonlyMap<string, number>,
  shown: ReadonlySet<string>,
  metrics: BarMetrics,
): number {
  let items = 0;
  let width = 0;
  let group: string | null = null;
  for (const unit of units) {
    if (unit.end || !shown.has(unit.id)) continue;
    if (group !== null && unit.group !== group) {
      width += metrics.separator;
      items += 1;
    }
    width += widthOf(widths, unit);
    items += 1;
    group = unit.group;
  }
  const ends = units.filter((unit) => unit.end && shown.has(unit.id));
  const more = units.some((unit) => !shown.has(unit.id));
  // the free space before the end is an item of no width
  if (ends.length > 0 || more) items += 1;
  for (const unit of ends) {
    width += widthOf(widths, unit);
    items += 1;
  }
  if (more) {
    width += metrics.more;
    items += 1;
  }
  return width + Math.max(0, items - 1) * metrics.gap;
}

/** Units that leave so the bar fits `available`: whole priorities, the lowest first. */
export function hiddenUnits(
  units: readonly ToolUnit[],
  widths: ReadonlyMap<string, number>,
  available: number,
  metrics: BarMetrics,
): Set<string> {
  const levels = [...new Set(units.map((unit) => unit.priority))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const hidden = new Set<string>();
  const shown = () => new Set(units.filter((unit) => !hidden.has(unit.id)).map((unit) => unit.id));
  for (const level of levels) {
    if (barWidth(units, widths, shown(), metrics) <= available) break;
    for (const unit of units) if (unit.priority === level) hidden.add(unit.id);
  }
  return hidden;
}

/** The hidden units by group, in the bar's order, packed into rows at most `max` wide. */
export function packRows(
  units: readonly ToolUnit[],
  widths: ReadonlyMap<string, number>,
  hidden: ReadonlySet<string>,
  max: number,
  metrics: BarMetrics,
): ToolUnit[][][] {
  const groups: ToolUnit[][] = [];
  for (const unit of units) {
    if (!hidden.has(unit.id)) continue;
    const last = groups.at(-1);
    if (last && last[0]?.group === unit.group) last.push(unit);
    else groups.push([unit]);
  }
  const rows: ToolUnit[][][] = [];
  let used = 0;
  for (const group of groups) {
    const width =
      group.reduce((sum, unit) => sum + widthOf(widths, unit), 0) +
      (group.length - 1) * metrics.gap;
    const joined = used + 2 * metrics.gap + metrics.separator + width;
    const row = rows.at(-1);
    if (row && joined <= max) {
      row.push(group);
      used = joined;
    } else {
      rows.push([group]);
      used = width;
    }
  }
  return rows;
}

export function planOverflow(
  units: readonly ToolUnit[],
  widths: ReadonlyMap<string, number>,
  available: number,
  metrics: BarMetrics,
  panelPadding = 0,
): OverflowPlan {
  const hidden = hiddenUnits(units, widths, available, metrics);
  const shown = new Set(units.filter((unit) => !hidden.has(unit.id)).map((unit) => unit.id));
  const cramped = barWidth(units, widths, shown, metrics) > available;
  if (hidden.size === 0) return cramped ? { ...NO_OVERFLOW, cramped } : NO_OVERFLOW;
  return {
    hidden,
    rows: packRows(units, widths, hidden, available - 2 * panelPadding, metrics),
    cramped,
  };
}

/** Whether two plans put the same units in the same places. */
export function samePlan(a: OverflowPlan, b: OverflowPlan): boolean {
  const lines = (plan: OverflowPlan) =>
    plan.rows.map((row) => row.map((group) => group.map((unit) => unit.id).join()).join("|"));
  return (
    a.cramped === b.cramped &&
    a.hidden.size === b.hidden.size &&
    [...a.hidden].every((id) => b.hidden.has(id)) &&
    lines(a).join("/") === lines(b).join("/")
  );
}
