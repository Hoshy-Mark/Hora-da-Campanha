// Expressões suportadas: "d20", "1d20", "2d6+3", "4d8-2", "1d100".
// Formato: [quantidade]d<lados>[+/-modificador]

export interface DiceExpression {
  count: number;
  sides: number;
  modifier: number;
}

export interface DiceRollResult {
  expression: DiceExpression;
  rolls: number[];
  total: number;
}

const EXPR_RE = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i;

export function parseDiceExpression(raw: string): DiceExpression | null {
  const match = EXPR_RE.exec(raw);
  if (!match) return null;

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3].replace(/\s/g, ''), 10) : 0;

  if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;

  return { count, sides, modifier };
}

export function rollDice(expr: DiceExpression): DiceRollResult {
  const rolls = Array.from({ length: expr.count }, () => 1 + Math.floor(Math.random() * expr.sides));
  const total = rolls.reduce((sum, r) => sum + r, 0) + expr.modifier;
  return { expression: expr, rolls, total };
}

export function formatExpression(expr: DiceExpression): string {
  const base = `${expr.count}d${expr.sides}`;
  if (expr.modifier === 0) return base;
  return expr.modifier > 0 ? `${base}+${expr.modifier}` : `${base}${expr.modifier}`;
}
