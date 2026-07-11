import { useState, useEffect } from "react";
import { getHistory, deleteHistory, clearHistory, GenerationHistory } from "@/lib/history";

export function useHistory() {
  const [history, setHistory] = useState<GenerationHistory[]>([]);

  useEffect(() => {
    setHistory(getHistory());
    const handleUpdate = () => setHistory(getHistory());
    window.addEventListener("history_updated", handleUpdate);
    return () => window.removeEventListener("history_updated", handleUpdate);
  }, []);

  return {
    history,
    deleteItem: (id: string) => deleteHistory(id),
    clearAll: () => clearHistory(),
  };
}
