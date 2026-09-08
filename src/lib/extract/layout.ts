/**
 * Putting OCR lines back into reading order.
 *
 * ML Kit returns blocks roughly top-to-bottom, but a block is a visual cluster,
 * not a row. On a receipt with "Total" at the left margin and "£84.60" at the
 * right, or a letter with an address beside a date, the flat `text` string
 * interleaves the columns and the two halves of a row end up paragraphs apart.
 * Every recipe downstream assumes it is reading rows the way a person would,
 * so the geometry has to be used rather than discarded.
 *
 * Lines are grouped into rows by vertical overlap rather than by distance
 * between centres: a tall heading next to small print belongs on the same row
 * if they overlap, and two body lines a millimetre apart do not.
 */

export type Box = { left: number; top: number; right: number; bottom: number };

export type PositionedLine = {
  text: string;
  boundingBox?: Box;
};

/** Two lines share a row when they overlap by more than this much of the shorter one. */
const OVERLAP_RATIO = 0.5;

type Placed = { text: string; box: Box };

function verticalOverlap(a: Box, b: Box): number {
  return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
}

function sharesRow(row: Placed[], candidate: Placed): boolean {
  return row.some((member) => {
    const overlap = verticalOverlap(member.box, candidate.box);
    if (overlap <= 0) return false;
    const shorter = Math.min(
      member.box.bottom - member.box.top,
      candidate.box.bottom - candidate.box.top,
    );
    return shorter > 0 && overlap / shorter >= OVERLAP_RATIO;
  });
}

/**
 * Rows of text, in reading order.
 *
 * Falls back to the order ML Kit gave us when the geometry is missing — some
 * devices and some image sources do not populate bounding boxes, and a
 * degraded order is better than dropping the text.
 */
export function orderLines(lines: PositionedLine[]): string[] {
  const placed: Placed[] = [];
  let missingGeometry = false;

  for (const line of lines) {
    if (line.boundingBox) placed.push({ text: line.text, box: line.boundingBox });
    else missingGeometry = true;
  }

  if (missingGeometry || placed.length === 0) return lines.map((line) => line.text);

  const byTop = [...placed].sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);

  const rows: Placed[][] = [];
  for (const line of byTop) {
    const row = rows.find((candidate) => sharesRow(candidate, line));
    if (row) row.push(line);
    else rows.push([line]);
  }

  return rows.map((row) =>
    [...row]
      .sort((a, b) => a.box.left - b.box.left)
      .map((line) => line.text)
      .join(" "),
  );
}

/** Every line of every block, flattened, keeping whatever geometry came with it. */
export function flattenBlocks(
  blocks: Array<{ lines?: PositionedLine[]; text?: string; boundingBox?: Box }>,
): PositionedLine[] {
  const out: PositionedLine[] = [];
  for (const block of blocks) {
    if (block.lines && block.lines.length > 0) {
      out.push(...block.lines);
    } else if (block.text !== undefined) {
      out.push({ text: block.text, boundingBox: block.boundingBox });
    }
  }
  return out;
}
