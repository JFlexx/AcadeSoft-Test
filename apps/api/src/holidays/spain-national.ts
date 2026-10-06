/**
 * Festivos nacionales de España (comunes a todas las comunidades) para un
 * curso escolar, de septiembre a agosto. Los autonómicos y locales varían y
 * los añade cada academia a mano.
 */

import { addDays } from '../class-schedule/zoned-time';

/** Domingo de Pascua (algoritmo gregoriano anónimo). */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function spainNationalHolidays(schoolYear: number): { name: string; date: string }[] {
  const y = schoolYear;
  const n = schoolYear + 1;
  return [
    { name: 'Fiesta Nacional de España', date: `${y}-10-12` },
    { name: 'Todos los Santos', date: `${y}-11-01` },
    { name: 'Día de la Constitución', date: `${y}-12-06` },
    { name: 'Inmaculada Concepción', date: `${y}-12-08` },
    { name: 'Navidad', date: `${y}-12-25` },
    { name: 'Año Nuevo', date: `${n}-01-01` },
    { name: 'Epifanía del Señor', date: `${n}-01-06` },
    { name: 'Viernes Santo', date: addDays(easterSunday(n), -2) },
    { name: 'Fiesta del Trabajo', date: `${n}-05-01` },
    { name: 'Asunción de la Virgen', date: `${n}-08-15` },
  ];
}
