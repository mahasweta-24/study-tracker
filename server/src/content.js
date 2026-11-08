import { readFileSync } from 'node:fs';

const load = (name) => JSON.parse(readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8'));

export const powerbi = load('powerbi.json');
export const cases = load('casestudies.json');

export const PBI_DAYS = powerbi.days.length; // 100
export const pbiDay = (n) => powerbi.days.find((d) => d.day === n);
export const caseById = (id) => cases.cases.find((c) => c.id === id);
export const MAX_WEEK = 60;
