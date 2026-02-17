const BASE = "http://127.0.0.1:8000";

export async function runScenario(name: string) {
  const res = await fetch(`${BASE}/run/${name}`);
  return await res.json();
}
