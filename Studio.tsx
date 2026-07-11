import { useState, useEffect } from "react";
import { useGetVoices, UserInfo } from "@workspace/api-client-react";
import { useTTS } from "@/hooks/use-tts";
import { useHistory } from "@/hooks/use-history";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { PlayIcon, DownloadIcon, HistoryIcon, Volume2Icon, Settings2Icon, MicIcon, Trash2Icon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StudioProps {
  user: UserInfo;
}

export function Studio({ user }: StudioProps) {
  const { data: voiceData, isLoading: isLoadingVoices } = useGetVoices();
  const { generate, isGenerating, audioUrl, srtUrl } = useTTS();
  const { history, deleteItem, clearAll } = useHistory();

  const [text, setText] = useState("");
  const [voice, setVoice] = useState("Thiha");
  const [style, setStyle] = useState("normal");
  
  // Custom Fine-Tuning — defaults match the server's "normal" style baseline
  // (+20% rate for faster flow, +30% volume for a louder/clearer result).
  const [rate, setRate] = useState(20); // -50 to 100
  const [pitch, setPitch] = useState(0); // -20 to 20
  const [volume, setVolume] = useState(30); // -50 to 100

  const handleGenerate = () => {
    if (!text.trim()) return;
    
    // Formatting: rate: "+10%", pitch: "-5Hz", volume: "+0%"
    const rateStr = `${rate > 0 ? '+' : ''}${rate}%`;
    const pitchStr = `${pitch > 0 ? '+' : ''}${pitch}Hz`;
    const volumeStr = `${volume > 0 ? '+' : ''}${volume}%`;

    generate({
      text,
      voice,
      style,
      rate: rateStr,
      pitch: pitchStr,
      volume: volumeStr,
    });
  };

  const handleStyleSelect = (styleKey: string, styleData: any) => {
    setStyle(styleKey);
    // Parse styleData.rate, styleData.pitch, styleData.volume
    // e.g. "+0%" -> 0, "-10Hz" -> -10
    const parseVal = (str: string, suffix: string) => {
      if (!str) return 0;
      return parseInt(str.replace(suffix, '').replace('+', '')) || 0;
    };
    
    setRate(parseVal(styleData.rate, '%'));
    setPitch(parseVal(styleData.pitch, 'Hz'));
    setVolume(parseVal(styleData.volume, '%'));
  };

  const restoreHistory = (item: any) => {
    setText(item.text);
    setVoice(item.voice);
    setStyle(item.style);
    
    const parseVal = (str: string, suffix: string) => {
      if (!str) return 0;
      return parseInt(str.replace(suffix, '').replace('+', '')) || 0;
    };

    setRate(parseVal(item.rate, '%'));
    setPitch(parseVal(item.pitch, 'Hz'));
    setVolume(parseVal(item.volume, '%'));
  };

  if (isLoadingVoices) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  const voices = voiceData?.voices || {};
  const styles = voiceData?.styles || {};

  // Map gender to emojis as requested
  const genderEmoji = (gender: string) => {
    if (gender?.toLowerCase() === 'female') return '👩';
    if (gender?.toLowerCase() === 'male') return '👨';
    return '👤';
  };

  // Map style keys to emojis
  const styleEmoji: Record<string, string> = {
    normal: '😐',
    happy: '😊',
    sad: '😢',
    angry: '😠',
    calm: '😌',
    excited: '🤩',
    formal: '👔',
    movieRecap: '🎬',
    storytelling: '📖',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-6">
        
        {/* Voices & Styles */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MicIcon className="w-5 h-5 text-primary" />
              Voice Selection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voice (6 options)</Label>
              <Select value={voice} onValueChange={setVoice}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a voice" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(voices).map(([key, v]) => (
                    <SelectItem key={key} value={key}>
                      <span className="mr-2">{genderEmoji(v.gender)}</span>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voice Style / Emotion</Label>
              <Select value={style} onValueChange={(key) => handleStyleSelect(key, styles[key])}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a style" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(styles).map(([key, s]) => (
                    <SelectItem key={key} value={key}>
                      <span className="mr-2">{styleEmoji[key] || '✨'}</span>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
          </CardContent>
        </Card>

        {/* Text Input */}
        <Card className="border-border/50 bg-card/50 backdrop-blur overflow-hidden flex flex-col">
          <CardHeader className="bg-muted/30 pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Script</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {text.length} characters · Unlimited
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 relative">
            <Textarea 
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter Myanmar text here..."
              className="min-h-[250px] w-full resize-none border-0 focus-visible:ring-0 rounded-none p-4 md:text-lg bg-transparent"
            />
          </CardContent>
          <div className="p-4 bg-muted/30 border-t border-border/50 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Supports standard Myanmar Unicode characters
            </p>
            <Button 
              size="lg" 
              onClick={handleGenerate} 
              disabled={!text.trim() || isGenerating}
              className="px-8 font-semibold shadow-md"
            >
              {isGenerating ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Generating...
                </>
              ) : (
                <>
                  <Volume2Icon className="mr-2 h-4 w-4" />
                  Generate Audio
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Result Player */}
        {audioUrl && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-6 flex flex-col md:flex-row items-center gap-6">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                <PlayIcon className="w-6 h-6 ml-1" />
              </div>
              <div className="flex-1 w-full">
                <audio src={audioUrl} controls className="w-full" autoPlay />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0 w-full md:w-auto">
                <Button asChild variant="outline" className="w-full md:w-auto">
                  <a href={audioUrl} download={`tts-${Date.now()}.mp3`}>
                    <DownloadIcon className="w-4 h-4 mr-2" />
                    Download MP3
                  </a>
                </Button>
                {srtUrl && (
                  <Button asChild variant="outline" className="w-full md:w-auto">
                    <a href={srtUrl} download={`tts-${Date.now()}.srt`}>
                      <DownloadIcon className="w-4 h-4 mr-2" />
                      Download SRT
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="lg:col-span-4 space-y-6">
        
        {/* Fine Tuning */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings2Icon className="w-5 h-5 text-primary" />
              Fine Tuning
            </CardTitle>
            <CardDescription>Adjust voice parameters manually</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Speed</Label>
                <span className="text-xs font-mono text-muted-foreground w-12 text-right">
                  {rate > 0 ? `+${rate}` : rate}%
                </span>
              </div>
              <Slider 
                value={[rate]} 
                min={-50} 
                max={100} 
                step={5} 
                onValueChange={(v) => { setRate(v[0]); setStyle('custom'); }} 
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Pitch</Label>
                <span className="text-xs font-mono text-muted-foreground w-12 text-right">
                  {pitch > 0 ? `+${pitch}` : pitch}Hz
                </span>
              </div>
              <Slider 
                value={[pitch]} 
                min={-20} 
                max={20} 
                step={2} 
                onValueChange={(v) => { setPitch(v[0]); setStyle('custom'); }} 
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Volume</Label>
                <span className="text-xs font-mono text-muted-foreground w-12 text-right">
                  {volume > 0 ? `+${volume}` : volume}%
                </span>
              </div>
              <Slider 
                value={[volume]} 
                min={-50} 
                max={100} 
                step={5} 
                onValueChange={(v) => { setVolume(v[0]); setStyle('custom'); }} 
              />
            </div>

          </CardContent>
        </Card>

        {/* History */}
        <Card className="border-border/50 bg-card/50 backdrop-blur flex flex-col h-[400px]">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <HistoryIcon className="w-5 h-5 text-primary" />
                History
              </CardTitle>
              {history.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2Icon className="w-3 h-3 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
          </CardHeader>
          <ScrollArea className="flex-1">
            <CardContent className="p-4 space-y-3">
              {history.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No generation history yet.
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border border-border bg-background hover:border-primary/50 transition-colors group relative"
                  >
                    <div
                      onClick={() => restoreHistory(item)}
                      className="cursor-pointer pr-7"
                    >
                      <p className="text-sm line-clamp-2 mb-2 text-foreground/80 group-hover:text-foreground">
                        "{item.text}"
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="secondary" className="font-normal text-[10px] px-1.5 h-4">
                          {voices[item.voice]?.label || item.voice}
                        </Badge>
                        <Badge variant="outline" className="font-normal text-[10px] px-1.5 h-4">
                          {item.style}
                        </Badge>
                        <span className="text-muted-foreground ml-auto text-[10px]">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                      className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
                      aria-label="Delete history item"
                    >
                      <Trash2Icon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </CardContent>
          </ScrollArea>
        </Card>

      </div>
    </div>
  );
}
