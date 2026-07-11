import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { addHistory } from "@/lib/history";

export interface GenerateTTSParams {
  text: string;
  voice: string;
  style: string;
  rate: string;
  pitch: string;
  volume: string;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

export function useTTS() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [srtUrl, setSrtUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const generate = async (params: GenerateTTSParams) => {
    setIsGenerating(true);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    if (srtUrl) {
      URL.revokeObjectURL(srtUrl);
      setSrtUrl(null);
    }

    try {
      const token = getToken();
      if (!token) throw new Error("Not authenticated");

      const response = await fetch("/api/tts/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        let errorMessage = "Failed to generate audio";
        try {
          const data = await response.json();
          if (data.error) errorMessage = data.error;
        } catch (e) {}
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const audioBlob = base64ToBlob(data.audioBase64, data.mimeType || "audio/mpeg");
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      if (data.srt && typeof data.srt === "string" && data.srt.trim()) {
        const srtBlob = new Blob([data.srt], { type: "application/x-subrip" });
        setSrtUrl(URL.createObjectURL(srtBlob));
      }

      addHistory({
        text: params.text,
        voice: params.voice,
        style: params.style,
        rate: params.rate,
        pitch: params.pitch,
        volume: params.volume,
      });

      toast({
        title: "Audio & subtitles generated successfully",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: error.message,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return { generate, isGenerating, audioUrl, srtUrl };
}
