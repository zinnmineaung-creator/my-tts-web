export interface GenerationHistory {
  id: string;
  text: string;
  voice: string;
  style: string;
  rate: string;
  pitch: string;
  volume: string;
  timestamp: number;
}

const HISTORY_KEY = 'tts_history';
const MAX_HISTORY = 10;

export function getHistory(): GenerationHistory[] {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

export function addHistory(item: Omit<GenerationHistory, 'id' | 'timestamp'>) {
  const history = getHistory();
  const newItem: GenerationHistory = {
    ...item,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  
  const newHistory = [newItem, ...history].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
  window.dispatchEvent(new Event('history_updated'));
  return newItem;
}

export function deleteHistory(id: string) {
  const updated = getHistory().filter((item) => item.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  window.dispatchEvent(new Event('history_updated'));
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  window.dispatchEvent(new Event('history_updated'));
}
