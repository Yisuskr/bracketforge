export type Entrant = { id: string; name: string; seed: number };
export type Slot = { entrantId: string | null; sourceMatchId?: string };
export type BracketMatch = {
  id: string;
  round: number;
  position: number;
  participantOne: Slot;
  participantTwo: Slot;
  nextMatchId: string | null;
};
export type SingleEliminationBracket = {
  size: number;
  rounds: number;
  matches: BracketMatch[];
};

export function nextPowerOfTwo(value: number): number {
  if (!Number.isInteger(value) || value < 1)
    throw new RangeError("value must be a positive integer");
  return 2 ** Math.ceil(Math.log2(value));
}

export function seededPositions(size: number): number[] {
  if (size === 1) return [1];
  if (size < 1 || (size & (size - 1)) !== 0)
    throw new RangeError("size must be a power of two");
  let positions = [1, 2];
  while (positions.length < size) {
    const nextSize = positions.length * 2;
    positions = positions.flatMap((seed) => [seed, nextSize + 1 - seed]);
  }
  return positions;
}

export function createSingleEliminationBracket(
  entrants: Entrant[],
): SingleEliminationBracket {
  if (entrants.length < 2)
    throw new RangeError("at least two entrants are required");
  const uniqueIds = new Set(entrants.map(({ id }) => id));
  if (uniqueIds.size !== entrants.length)
    throw new Error("entrant ids must be unique");
  const ordered = [...entrants].sort((a, b) => a.seed - b.seed);
  const size = nextPowerOfTwo(ordered.length);
  const rounds = Math.log2(size);
  const slots = seededPositions(size).map(
    (seed) => ordered[seed - 1]?.id ?? null,
  );
  const matches: BracketMatch[] = [];
  let previousRound: BracketMatch[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    const count = size / 2 ** round;
    const current = Array.from({ length: count }, (_, position) => {
      const id = `r${round}-m${position + 1}`;
      const match: BracketMatch = {
        id,
        round,
        position: position + 1,
        participantOne:
          round === 1
            ? { entrantId: slots[position * 2] }
            : {
                entrantId: null,
                sourceMatchId: previousRound[position * 2].id,
              },
        participantTwo:
          round === 1
            ? { entrantId: slots[position * 2 + 1] }
            : {
                entrantId: null,
                sourceMatchId: previousRound[position * 2 + 1].id,
              },
        nextMatchId:
          round === rounds
            ? null
            : `r${round + 1}-m${Math.floor(position / 2) + 1}`,
      };
      return match;
    });
    matches.push(...current);
    previousRound = current;
  }
  return { size, rounds, matches };
}

export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  const random = mulberry32(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
