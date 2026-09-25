import type { ThrowName, ThrowZone } from "@/lib/types";

export const THROW_ODDS: Record<ThrowZone, Record<ThrowName, number>> = {
  inside: {
    nak: 0,
    backdo: 1 / 16,
    do: 3 / 16,
    gae: 6 / 16,
    geol: 4 / 16,
    yut: 1 / 16,
    mo: 1 / 16,
  },
  outside: {
    nak: 0.08,
    backdo: 0.054,
    do: 0.163,
    gae: 0.326,
    geol: 0.217,
    yut: 0.08,
    mo: 0.08,
  },
};

const THROW_ORDER: ThrowName[] = ["nak", "backdo", "do", "gae", "geol", "yut", "mo"];

export function pickThrowName(zone: ThrowZone, randomValue = Math.random()): ThrowName {
  const roll = Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON);
  let cumulative = 0;

  for (const name of THROW_ORDER) {
    cumulative += THROW_ODDS[zone][name];
    if (roll < cumulative) return name;
  }

  return "mo";
}
