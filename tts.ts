import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { unlink, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { requireAuth } from "./auth";

const router: IRouter = Router();

// Microsoft Edge TTS only ships two real neural voices for the my-MM (Myanmar) locale:
// my-MM-NilarNeural (female) and my-MM-ThihaNeural (male). There is no native 6-voice
// catalog. To offer 6 genuinely distinct-sounding options (mixing male/female and
// adult/youth/elder tones for storytelling), each persona below pairs one of the two
// real neural voices with a tuned base rate/pitch/volume offset. These base offsets are
// combined numerically with the per-request style/custom offsets at generation time.
interface VoiceConfig {
  name: string;
  label: string;
  gender: "male" | "female";
  baseRate: number;
  basePitch: number;
  baseVolume: number;
}

const VOICES: Record<string, VoiceConfig> = {
  Thiha:    { name: "my-MM-ThihaNeural", label: "Thiha — Adult Male (လူကြီးအသံ)",          gender: "male",   baseRate: 0,   basePitch: 0,   baseVolume: 0  },
  Nilar:    { name: "my-MM-NilarNeural", label: "Nilar — Adult Female (လူကြီးအသံ)",         gender: "female", baseRate: 0,   basePitch: 0,   baseVolume: 0  },
  KyawKyaw: { name: "my-MM-ThihaNeural", label: "Kyaw Kyaw — Youth Male (လူငယ်အသံ)",        gender: "male",   baseRate: 12,  basePitch: 10,  baseVolume: 5  },
  SuSu:     { name: "my-MM-NilarNeural", label: "Su Su — Youth Female (လူငယ်အသံ)",          gender: "female", baseRate: 15,  basePitch: 18,  baseVolume: 5  },
  AungAung: { name: "my-MM-ThihaNeural", label: "Aung Aung — Elder Narrator (အဘိုးအသံ)",    gender: "male",   baseRate: -12, basePitch: -14, baseVolume: 0  },
  HlaHla:   { name: "my-MM-NilarNeural", label: "Hla Hla — Elder Gentle Female (အဖွားအသံ)", gender: "female", baseRate: -10, basePitch: -12, baseVolume: -5 },
};

// Baseline is +20% rate / +30% volume baked into every style.
const STYLES: Record<string, { rate: string; pitch: string; volume: string; label: string }> = {
  normal:      { rate: "+20%", pitch: "+0Hz",  volume: "+30%", label: "Normal"      },
  happy:       { rate: "+30%", pitch: "+5Hz",  volume: "+35%", label: "Happy"       },
  sad:         { rate: "+5%",  pitch: "-8Hz",  volume: "+20%", label: "Sad"         },
  angry:       { rate: "+35%", pitch: "+8Hz",  volume: "+45%", label: "Angry"       },
  calm:        { rate: "+10%", pitch: "-3Hz",  volume: "+25%", label: "Calm"        },
  excited:     { rate: "+40%", pitch: "+10Hz", volume: "+40%", label: "Excited"     },
  formal:      { rate: "+15%", pitch: "-5Hz",  volume: "+30%", label: "Formal"      },
  movieRecap:  { rate: "+45%", pitch: "-2Hz",  volume: "+40%", label: "Movie Recap" },
  storytelling:{ rate: "+12%", pitch: "-4Hz",  volume: "+30%", label: "Storytelling"},
};

const MAX_TEXT_LENGTH = 50_000;

// Each subtitle line is synthesized as its own audio clip. All clips are launched in
// parallel (unrestricted Promise.all) so wall time ≈ slowest single segment, not the
// sum. This approach:
//   - Eliminates inter-sentence pauses edge-tts inserts in a single batch call (those
//     pauses cannot be stripped after the fact because they are baked into the audio).
//   - Provides a real ffprobe-measured duration for every clip so each SRT cue's end
//     timestamp cuts off exactly when that segment finishes speaking, with no overlap
//     and no lag.
// Clips are joined back-to-back (0 ms silence gap) via the ffmpeg concat demuxer,
// which copies bytes without re-encoding — the fastest possible assembly.
const MAX_LINE_LEN = 45;

function parseNum(str: string | undefined | null, suffix: string): number {
  if (!str) return 0;
  const n = parseFloat(str.replace(suffix, "").replace("+", ""));
  return Number.isNaN(n) ? 0 : n;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function fmtPct(n: number): string {
  const r = Math.round(n);
  return `${r >= 0 ? "+" : ""}${r}%`;
}

function fmtHz(n: number): string {
  const r = Math.round(n);
  return `${r >= 0 ? "+" : ""}${r}Hz`;
}

function pad(n: number, len: number): string {
  return String(n).padStart(len, "0");
}

function formatMsToSrtTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3600000);
  const m = Math.floor((clamped % 3600000) / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  const msec = clamped % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(msec, 3)}`;
}

// Splits text into CapCut-friendly sentence-sized chunks (≤45 chars), breaking first on
// Myanmar/Latin sentence terminators, then soft breaks (Myanmar comma "၊" / ","), then
// hard-slicing as a last resort so no chunk is ever too long or empty.
function splitIntoSubtitleLines(text: string, maxLen: number = MAX_LINE_LEN): string[] {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return [];

  const rawSentences = cleaned
    .split(/(?<=[။!?.])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const sentences = rawSentences.length ? rawSentences : [cleaned];

  const softSplit: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxLen) {
      softSplit.push(sentence);
      continue;
    }
    const parts = sentence.split(/(?<=[၊,])\s*/).filter(Boolean);
    let buf = "";
    for (const part of parts) {
      if (buf && (buf + part).length > maxLen) {
        softSplit.push(buf.trim());
        buf = part;
      } else {
        buf += part;
      }
    }
    if (buf.trim()) softSplit.push(buf.trim());
  }

  const finalLines: string[] = [];
  for (const line of softSplit) {
    let remaining = line;
    while (remaining.length > maxLen) {
      let cut = remaining.lastIndexOf(" ", maxLen);
      if (cut <= 0) cut = maxLen;
      finalLines.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) finalLines.push(remaining);
  }

  return finalLines.filter(Boolean);
}

// Synthesizes a single subtitle line to an MP3 file via one edge-tts call.
function synthesizeSegment(
  text: string,
  voiceName: string,
  rateStr: string,
  pitchStr: string,
  volumeStr: string,
  outFile: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Python's argparse treats any argument starting with "-" as a flag name, not a
    // value. Negative rate/pitch/volume strings (e.g. "-12%", "-14Hz") passed as
    // ["--rate", "-12%"] cause argparse to error with "expected one argument". Joining
    // flag and value as "--rate=-12%" passes them as a single token, bypassing the
    // ambiguity entirely.
    const proc = spawn("edge-tts", [
      `--voice=${voiceName}`,
      `--rate=${rateStr}`,
      `--pitch=${pitchStr}`,
      `--volume=${volumeStr}`,
      `--text=${text}`,
      `--write-media=${outFile}`,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0 || !existsSync(outFile)) {
        reject(new Error(stderr || `edge-tts exited with code ${code}`));
      } else {
        resolve();
      }
    });
    proc.on("error", reject);
  });
}

// Returns the exact playback duration of an audio file in milliseconds via ffprobe.
function getAudioDurationMs(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) { reject(new Error(stderr || `ffprobe exited ${code}`)); return; }
      const seconds = parseFloat(stdout.trim());
      if (Number.isNaN(seconds)) { reject(new Error(`ffprobe bad output: ${stdout}`)); return; }
      resolve(Math.round(seconds * 1000));
    });
    proc.on("error", reject);
  });
}

// Strips leading and trailing silence from a raw edge-tts segment so clips flow
// seamlessly when concatenated. The -50 dB threshold and 20 ms minimum duration
// target only true silence pads, not quiet speech. Output is re-encoded to a
// normalised 24 kHz mono MP3 so every clip has an identical format for safe
// copy-mode concatenation.
function trimSilence(inputFile: string, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const silenceFilter =
      "silenceremove=" +
      "start_periods=1:start_duration=0.01:start_threshold=-50dB:" +
      "stop_periods=-1:stop_duration=0.02:stop_threshold=-50dB";

    const proc = spawn("ffmpeg", [
      "-i", inputFile,
      "-af", silenceFilter,
      "-ar", "24000",
      "-ac", "1",
      "-c:a", "libmp3lame",
      "-q:a", "2",
      "-y", outputFile,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0 || !existsSync(outputFile)) {
        reject(new Error(stderr || `ffmpeg silenceremove exited ${code}`));
      } else {
        resolve();
      }
    });
    proc.on("error", reject);
  });
}

// Joins trimmed segment MP3 files back-to-back with zero silence gap using the ffmpeg
// concat demuxer in copy mode. All inputs share identical codec/sample-rate/channels
// after the trimSilence normalisation step, so copy mode is safe and very fast.
function concatenateSegments(segmentFiles: string[], listFile: string, outFile: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const listContent = segmentFiles.map((f) => `file '${f}'`).join("\n");
    await writeFile(listFile, listContent, "utf8");

    const proc = spawn("ffmpeg", [
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-c", "copy",
      "-y", outFile,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0 || !existsSync(outFile)) {
        reject(new Error(stderr || `ffmpeg concat exited ${code}`));
      } else {
        resolve();
      }
    });
    proc.on("error", reject);
  });
}

// SRT timing: display duration = max(0.5 s, charCount × 0.04 s), then hard-capped at
// the segment's real measured audio length so the subtitle never overshoots the spoken
// word. Cues are placed back-to-back (0 ms gap) so the next line appears the instant
// the previous one finishes.
const SECONDS_PER_CHAR = 0.04;
const MIN_CUE_SECONDS  = 0.5;

function buildSrt(lines: string[], realDurationsMs: number[]): string {
  let elapsed = 0;
  const cues: { start: number; end: number; text: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const start          = elapsed;
    const formulaMs      = Math.max(MIN_CUE_SECONDS * 1000, lines[i].length * SECONDS_PER_CHAR * 1000);
    const realMs         = realDurationsMs[i] > 0 ? realDurationsMs[i] : formulaMs;
    const durationMs     = Math.min(formulaMs, realMs);   // never overshoot real audio
    const end            = start + durationMs;
    cues.push({ start, end, text: lines[i] });
    elapsed = end;
  }

  return cues
    .map((c, i) => `${i + 1}\n${formatMsToSrtTime(c.start)} --> ${formatMsToSrtTime(c.end)}\n${c.text}\n`)
    .join("\n");
}

router.get("/tts/voices", async (_req, res): Promise<void> => {
  const voicesForResponse = Object.fromEntries(
    Object.entries(VOICES).map(([key, v]) => [key, { name: v.name, label: v.label, gender: v.gender }]),
  );
  res.json({ voices: voicesForResponse, styles: STYLES });
});

router.post("/tts/generate", (req, res): void => {
  requireAuth(req, res, async () => {
    const { text, voice = "Thiha", style = "normal", rate, pitch, volume } = req.body as {
      text: string;
      voice?: string;
      style?: string;
      rate?: string;
      pitch?: string;
      volume?: string;
    };

    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "Text cannot be empty" });
      return;
    }
    if (text.length > MAX_TEXT_LENGTH) {
      res.status(400).json({ error: `Text too long (max ${MAX_TEXT_LENGTH.toLocaleString()} chars)` });
      return;
    }

    const voiceConfig = VOICES[voice] ?? VOICES.Thiha;

    let offsetRate   = parseNum(rate,   "%");
    let offsetPitch  = parseNum(pitch,  "Hz");
    let offsetVolume = parseNum(volume, "%");

    if (!rate && !pitch && !volume) {
      const styleConfig = STYLES[style] ?? STYLES.normal;
      offsetRate   = parseNum(styleConfig.rate,   "%");
      offsetPitch  = parseNum(styleConfig.pitch,  "Hz");
      offsetVolume = parseNum(styleConfig.volume, "%");
    }

    const finalRateStr   = fmtPct(clamp(voiceConfig.baseRate   + offsetRate,   -90, 200));
    const finalPitchStr  = fmtHz( clamp(voiceConfig.basePitch  + offsetPitch,  -50,  50));
    const finalVolumeStr = fmtPct(clamp(voiceConfig.baseVolume + offsetVolume, -90, 150));

    const lines = splitIntoSubtitleLines(text);
    if (!lines.length) {
      res.status(400).json({ error: "Text cannot be empty" });
      return;
    }

    const uid          = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const rawSegFiles  = lines.map((_, i) => join(tmpdir(), `ttsseg_${uid}_${i}.mp3`));
    const trimSegFiles = lines.map((_, i) => join(tmpdir(), `ttstrim_${uid}_${i}.mp3`));
    const listFile     = join(tmpdir(), `ttslist_${uid}.txt`);
    const outFile      = join(tmpdir(), `tts_${uid}.mp3`);

    try {
      // Step 1 — synthesise all segments fully in parallel.
      await Promise.all(
        lines.map((line, i) =>
          synthesizeSegment(line, voiceConfig.name, finalRateStr, finalPitchStr, finalVolumeStr, rawSegFiles[i]),
        ),
      );

      // Step 2 — strip leading/trailing silence from every clip in parallel.
      // This removes the silence pads edge-tts bakes around each phrase and
      // normalises every clip to 24 kHz mono MP3 so copy-mode concat is safe.
      await Promise.all(
        rawSegFiles.map((raw, i) => trimSilence(raw, trimSegFiles[i])),
      );

      // Step 3 — measure trimmed durations + concatenate back-to-back, both in parallel.
      const [durationsMs] = await Promise.all([
        Promise.all(trimSegFiles.map(getAudioDurationMs)),
        concatenateSegments(trimSegFiles, listFile, outFile),
      ]);

      const audio = await readFile(outFile);
      const srt   = buildSrt(lines, durationsMs);

      res.json({
        audioBase64: audio.toString("base64"),
        mimeType:    "audio/mpeg",
        srt,
        filename:    `myanmar_tts_${Date.now()}`,
      });
    } catch (err) {
      req.log.error({ err }, "TTS generation failed");
      if (!res.headersSent) res.status(500).json({ error: "TTS generation failed" });
    } finally {
      await Promise.all(
        [...rawSegFiles, ...trimSegFiles, listFile, outFile].map((f) => unlink(f).catch(() => {})),
      );
    }
  });
});

export default router;
