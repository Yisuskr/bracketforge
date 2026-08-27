import { describe, expect, it } from "vitest";
import { createSingleEliminationBracket, nextPowerOfTwo, seededPositions, shuffleWithSeed } from "./single-elimination";

describe("single elimination", () => {
  it.each([[2,2],[3,4],[5,8],[9,16],[12,16],[32,32]])("finds bracket size for %i", (count, size) => expect(nextPowerOfTwo(count)).toBe(size));
  it("places the first two seeds on opposite halves", () => {
    const positions = seededPositions(8);
    expect(Math.abs(positions.indexOf(1) - positions.indexOf(2))).toBe(4);
  });
  it.each([2,3,4,5,6,7,8,9,12,16,32])("creates connected matches for %i entrants", (count) => {
    const bracket = createSingleEliminationBracket(Array.from({ length: count }, (_, i) => ({ id: `p${i+1}`, name: `Player ${i+1}`, seed: i+1 })));
    expect(bracket.matches).toHaveLength(bracket.size - 1);
    expect(bracket.matches.filter((match) => match.round === 1).flatMap((match) => [match.participantOne.entrantId, match.participantTwo.entrantId]).filter(Boolean)).toHaveLength(count);
    expect(bracket.matches.at(-1)?.nextMatchId).toBeNull();
  });
  it("shuffles reproducibly without changing the input", () => {
    const input = [1,2,3,4,5];
    expect(shuffleWithSeed(input, 42)).toEqual(shuffleWithSeed(input, 42));
    expect(input).toEqual([1,2,3,4,5]);
  });
});
