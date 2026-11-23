const BUSINESS_DAY_START_HOUR = 3;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getFormattedTime(date = new Date()) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

// Gece 03:00'a göre günlük tarih: 03:00'ten önceki saatler bir önceki güne aittir.
function getBusinessDayDateString(date = new Date()) {
  const hour = date.getHours();
  if (hour < BUSINESS_DAY_START_HOUR) {
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toLocaleDateString('tr-TR');
  }
  return date.toLocaleDateString('tr-TR');
}

function parseTimeParts(timeStr) {
  const raw = String(timeStr || '00:00:00').trim();
  const parts = raw.split(/[:.]/).map((part) => parseInt(String(part).replace(/\D/g, ''), 10));
  let hours = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minutes = Number.isFinite(parts[1]) ? parts[1] : 0;
  const seconds = Number.isFinite(parts[2]) ? parts[2] : 0;
  if (hours === 24) hours = 0;
  return { hours, minutes, seconds };
}

/**
 * sale_date iş günü tarihidir (00:00-02:59 bir gün geri yazılır).
 * sale_time gerçek saattir. Filtre/sıralama için takvim anına çevirir.
 */
function parseSaleDateTime(saleDateStr, saleTimeStr) {
  if (!saleDateStr) return null;
  const dateParts = String(saleDateStr).split(/[./-]/).map((p) => parseInt(p, 10));
  const day = dateParts[0];
  const month = dateParts[1];
  const year = dateParts[2];
  if (!year || !month || !day) return null;

  const { hours, minutes, seconds } = parseTimeParts(saleTimeStr);
  const actual = new Date(year, month - 1, day, hours, minutes, seconds);
  if (Number.isNaN(actual.getTime())) return null;

  if (hours < BUSINESS_DAY_START_HOUR) {
    actual.setDate(actual.getDate() + 1);
  }
  return actual;
}

function isSaleWithinLastHours(sale, hours, now = new Date()) {
  const saleDate = parseSaleDateTime(sale && sale.sale_date, sale && sale.sale_time);
  if (!saleDate) return false;
  const hoursAgo = new Date(now.getTime() - (Number(hours) * 60 * 60 * 1000));
  return saleDate >= hoursAgo;
}

function compareSalesByActualTimeDesc(a, b) {
  const dateA = parseSaleDateTime(a && a.sale_date, a && a.sale_time);
  const dateB = parseSaleDateTime(b && b.sale_date, b && b.sale_time);
  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;
  if (!dateB) return -1;
  return dateB - dateA;
}

module.exports = {
  BUSINESS_DAY_START_HOUR,
  getFormattedTime,
  getBusinessDayDateString,
  parseSaleDateTime,
  isSaleWithinLastHours,
  compareSalesByActualTimeDesc,
};
