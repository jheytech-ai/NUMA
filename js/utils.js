export function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  const startOfDay = d => { const r=new Date(d); r.setHours(0,0,0,0); return r; };
  return Math.round((startOfDay(b) - startOfDay(a))/ms);
}

export function formatDateISO(date){
  const d=new Date(date);
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2, "0");
  const day=String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateISO(iso) {
  if (!iso) return null;
  const [y,m,d]=iso.split("-").map(Number);
  return new Date(y,m-1,d);
}

export function addDays(date, amount){
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}
