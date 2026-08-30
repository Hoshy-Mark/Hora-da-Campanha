// Avaliador de fórmulas minúsculo e seguro — sem eval()/new Function().
// Suporta: + - * / , parênteses, negativo unário, e as funções
// floor/ceil/round/abs/min/max. Identificadores viram referências a
// outros campos da mesma ficha (ex: "FOR + RES", "floor((DEX-10)/2)").

type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: '+' | '-' | '*' | '/' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

type Node =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'neg'; value: Node }
  | { type: 'bin'; op: '+' | '-' | '*' | '/'; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[] };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  abs: Math.abs,
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
};

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const numStr = src.slice(i, j);
      const value = Number(numStr);
      if (Number.isNaN(value)) throw new Error(`Número inválido: "${numStr}"`);
      tokens.push({ type: 'num', value });
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j) });
      i = j;
    } else if (c === '+' || c === '-' || c === '*' || c === '/') {
      tokens.push({ type: 'op', value: c });
      i++;
    } else if (c === '(') {
      tokens.push({ type: 'lparen' });
      i++;
    } else if (c === ')') {
      tokens.push({ type: 'rparen' });
      i++;
    } else if (c === ',') {
      tokens.push({ type: 'comma' });
      i++;
    } else {
      throw new Error(`Caractere inesperado: "${c}"`);
    }
  }
  return tokens;
}

class Parser {
  private pos = 0;
  private tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek() {
    return this.tokens[this.pos];
  }
  private next() {
    return this.tokens[this.pos++];
  }

  parse(): Node {
    if (this.tokens.length === 0) throw new Error('Fórmula vazia.');
    const node = this.parseExpression();
    if (this.pos < this.tokens.length) throw new Error('Sobrou texto inesperado no final da fórmula.');
    return node;
  }

  private parseExpression(): Node {
    let left = this.parseTerm();
    while (this.peek()?.type === 'op' && (this.peek() as { value: string }).value in { '+': 0, '-': 0 }) {
      const op = (this.next() as { type: 'op'; value: '+' | '-' }).value;
      const right = this.parseTerm();
      left = { type: 'bin', op, left, right };
    }
    return left;
  }

  private parseTerm(): Node {
    let left = this.parseUnary();
    while (this.peek()?.type === 'op' && ((this.peek() as { value: string }).value === '*' || (this.peek() as { value: string }).value === '/')) {
      const op = (this.next() as { type: 'op'; value: '*' | '/' }).value;
      const right = this.parseUnary();
      left = { type: 'bin', op, left, right };
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.peek()?.type === 'op' && (this.peek() as { value: string }).value === '-') {
      this.next();
      return { type: 'neg', value: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const tok = this.next();
    if (!tok) throw new Error('Fim inesperado da fórmula.');

    if (tok.type === 'num') return { type: 'num', value: tok.value };

    if (tok.type === 'ident') {
      if (this.peek()?.type === 'lparen') {
        this.next(); // (
        const args: Node[] = [];
        if (this.peek()?.type !== 'rparen') {
          args.push(this.parseExpression());
          while (this.peek()?.type === 'comma') {
            this.next();
            args.push(this.parseExpression());
          }
        }
        if (this.peek()?.type !== 'rparen') throw new Error(`Esperava ")" após os argumentos de "${tok.value}".`);
        this.next(); // )
        return { type: 'call', name: tok.value, args };
      }
      return { type: 'var', name: tok.value };
    }

    if (tok.type === 'lparen') {
      const inner = this.parseExpression();
      if (this.peek()?.type !== 'rparen') throw new Error('Parêntese não fechado.');
      this.next();
      return inner;
    }

    throw new Error('Token inesperado na fórmula.');
  }
}

export function parseFormula(src: string): Node {
  return new Parser(tokenize(src)).parse();
}

function evaluateNode(node: Node, scope: Record<string, number>): number {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'var':
      return scope[node.name] ?? 0;
    case 'neg':
      return -evaluateNode(node.value, scope);
    case 'bin': {
      const l = evaluateNode(node.left, scope);
      const r = evaluateNode(node.right, scope);
      if (node.op === '+') return l + r;
      if (node.op === '-') return l - r;
      if (node.op === '*') return l * r;
      return r === 0 ? 0 : l / r;
    }
    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new Error(`Função desconhecida: "${node.name}". Use floor, ceil, round, abs, min ou max.`);
      return fn(...node.args.map((a) => evaluateNode(a, scope)));
    }
  }
}

export function computeFormula(src: string, scope: Record<string, number>): number {
  const ast = parseFormula(src);
  return evaluateNode(ast, scope);
}

// Usado na hora de importar um sistema: confirma que a fórmula pelo
// menos faz sentido sintaticamente, antes de qualquer campanha depender
// dela. Não garante que as variáveis referenciadas existem — isso só dá
// pra saber depois, comparando com as chaves dos outros campos.
export function validateFormulaSyntax(src: string): string | null {
  try {
    parseFormula(src);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
