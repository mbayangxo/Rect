import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type QcIssue = {
  code: string;
  severity: "fail" | "warn" | "info";
  message: string;
};

export type QcStatus = "pending" | "pass" | "warn" | "fail";

export type AudioQcResult = {
  status: QcStatus;
  sample_rate: number | null;
  channels: number | null;
  duration_secs: number | null;
  lufs_integrated: number | null;
  true_peak_dbtp: number | null;
  silence_ratio: number | null;
  issues: QcIssue[];
  checked_at: string;
};

/** Product targets (RECT_PRODUCT_SLICES). */
export const QC_TARGETS = {
  /** Soft target for streaming. */
  lufsAim: -14,
  /** Warn if louder than this (too hot). */
  lufsTooHot: -9,
  /** Warn if quieter than this. */
  lufsTooQuiet: -20,
  /** Fail if quieter than this (near silent / junk). */
  lufsFailQuiet: -40,
  /** True peak must be ≤ this (dBTP). */
  truePeakMax: -1,
  /** Fail if leading+trailing silence exceeds this fraction of duration. */
  silenceFailRatio: 0.45,
  /** Warn above this silence fraction. */
  silenceWarnRatio: 0.25,
  minSampleRate: 44100,
} as const;

function parseNumber(re: RegExp, text: string): number | null {
  const m = text.match(re);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

async function run(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 90_000,
    });
    return { stdout: String(stdout), stderr: String(stderr) };
  } catch (e) {
    const err = e as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    // ffmpeg writes analysis to stderr and often exits non-zero with -f null
    return {
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? err.message ?? ""),
    };
  }
}

/**
 * Measure loudness / peak / silence with ffmpeg + ffprobe.
 * Writes a temp file; caller owns the buffer.
 */
export async function analyzeAudioBuffer(
  buffer: Buffer,
  extHint = "mp3",
): Promise<AudioQcResult> {
  const checked_at = new Date().toISOString();
  const issues: QcIssue[] = [];
  const ext = extHint.replace(/^\./, "").slice(0, 5) || "mp3";
  const tmp = join(
    tmpdir(),
    `rect-qc-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`,
  );

  try {
    await fs.writeFile(tmp, buffer);

    const probe = await run("ffprobe", [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      tmp,
    ]);

    let sample_rate: number | null = null;
    let channels: number | null = null;
    let duration_secs: number | null = null;

    try {
      const json = JSON.parse(probe.stdout || "{}") as {
        streams?: Array<{
          codec_type?: string;
          sample_rate?: string;
          channels?: number;
          duration?: string;
        }>;
        format?: { duration?: string };
      };
      const audio = (json.streams ?? []).find((s) => s.codec_type === "audio");
      if (audio?.sample_rate) sample_rate = Number(audio.sample_rate) || null;
      if (audio?.channels != null) channels = Number(audio.channels) || null;
      const dur =
        audio?.duration || json.format?.duration || null;
      if (dur) duration_secs = Number(dur) || null;
    } catch {
      issues.push({
        code: "probe_parse",
        severity: "warn",
        message: "Could not parse ffprobe JSON — continuing with filters.",
      });
    }

    if (!sample_rate && !channels) {
      issues.push({
        code: "unreadable",
        severity: "fail",
        message: "Could not read audio stream — file may be corrupt.",
      });
      return {
        status: "fail",
        sample_rate,
        channels,
        duration_secs,
        lufs_integrated: null,
        true_peak_dbtp: null,
        silence_ratio: null,
        issues,
        checked_at,
      };
    }

    if (sample_rate != null && sample_rate < QC_TARGETS.minSampleRate) {
      issues.push({
        code: "sample_rate_low",
        severity: "warn",
        message: `Sample rate ${sample_rate} Hz is below ${QC_TARGETS.minSampleRate} Hz (DSP preferred).`,
      });
    }

    if (channels != null && channels < 1) {
      issues.push({
        code: "no_channels",
        severity: "fail",
        message: "No audio channels detected.",
      });
    }

    const ebu = await run("ffmpeg", [
      "-hide_banner",
      "-i",
      tmp,
      "-af",
      "ebur128=peak=true",
      "-f",
      "null",
      "-",
    ]);
    const ebuText = `${ebu.stderr}\n${ebu.stdout}`;
    // Prefer the final Summary block (ffmpeg ebur128).
    const summary =
      ebuText.match(/Summary:([\s\S]*?)(?:\n\[|\nsize=|$)/i)?.[1] ?? ebuText;
    const lufs_integrated =
      parseNumber(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/i, summary) ??
      parseNumber(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/i, ebuText);
    const true_peak_dbtp =
      parseNumber(
        /True peak:[\s\S]*?Peak:\s*(-?\d+(?:\.\d+)?)\s*dB/i,
        summary,
      ) ??
      parseNumber(/TPK:\s*(-?\d+(?:\.\d+)?)\s*dBFS/i, ebuText) ??
      parseNumber(/FTPK:\s*(-?\d+(?:\.\d+)?)\s*dBFS/i, ebuText);

    if (lufs_integrated == null) {
      issues.push({
        code: "lufs_unavailable",
        severity: "warn",
        message: "Could not measure integrated LUFS.",
      });
    } else {
      if (lufs_integrated <= QC_TARGETS.lufsFailQuiet) {
        issues.push({
          code: "too_quiet",
          severity: "fail",
          message: `Integrated loudness ${lufs_integrated.toFixed(1)} LUFS is near silence (fail below ${QC_TARGETS.lufsFailQuiet}).`,
        });
      } else if (lufs_integrated < QC_TARGETS.lufsTooQuiet) {
        issues.push({
          code: "quiet",
          severity: "warn",
          message: `Integrated loudness ${lufs_integrated.toFixed(1)} LUFS is quiet (aim ~${QC_TARGETS.lufsAim}).`,
        });
      } else if (lufs_integrated > QC_TARGETS.lufsTooHot) {
        issues.push({
          code: "too_hot",
          severity: "warn",
          message: `Integrated loudness ${lufs_integrated.toFixed(1)} LUFS is hot (aim ~${QC_TARGETS.lufsAim}).`,
        });
      }
    }

    if (true_peak_dbtp == null) {
      issues.push({
        code: "peak_unavailable",
        severity: "warn",
        message: "Could not measure true peak.",
      });
    } else if (true_peak_dbtp > QC_TARGETS.truePeakMax) {
      issues.push({
        code: "clipping_risk",
        severity: "fail",
        message: `True peak ${true_peak_dbtp.toFixed(1)} dBTP exceeds ${QC_TARGETS.truePeakMax} dBTP — risk of clipping on DSP.`,
      });
    }

    const sil = await run("ffmpeg", [
      "-hide_banner",
      "-i",
      tmp,
      "-af",
      "silencedetect=noise=-45dB:d=0.4",
      "-f",
      "null",
      "-",
    ]);
    const silText = `${sil.stderr}\n${sil.stdout}`;
    let silence_ratio: number | null = null;
    if (duration_secs && duration_secs > 0) {
      const starts = [...silText.matchAll(/silence_start:\s*(-?\d+(?:\.\d+)?)/gi)];
      const ends = [...silText.matchAll(/silence_end:\s*(-?\d+(?:\.\d+)?)/gi)];
      let silentSecs = 0;
      const n = Math.min(starts.length, ends.length);
      for (let i = 0; i < n; i++) {
        const a = Number(starts[i][1]);
        const b = Number(ends[i][1]);
        if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
          silentSecs += b - a;
        }
      }
      // trailing silence with no end
      if (starts.length > ends.length) {
        const a = Number(starts[starts.length - 1][1]);
        if (Number.isFinite(a) && a < duration_secs) {
          silentSecs += duration_secs - a;
        }
      }
      silence_ratio = Math.min(1, Math.max(0, silentSecs / duration_secs));
      if (silence_ratio >= QC_TARGETS.silenceFailRatio) {
        issues.push({
          code: "mostly_silence",
          severity: "fail",
          message: `About ${Math.round(silence_ratio * 100)}% of the file is silence — looks like junk or a bad export.`,
        });
      } else if (silence_ratio >= QC_TARGETS.silenceWarnRatio) {
        issues.push({
          code: "long_silence",
          severity: "warn",
          message: `About ${Math.round(silence_ratio * 100)}% silence — trim leading/trailing dead air.`,
        });
      }
    }

    if (duration_secs != null && duration_secs < 5) {
      issues.push({
        code: "too_short",
        severity: "fail",
        message: "Track is under 5 seconds.",
      });
    }

    const hasFail = issues.some((i) => i.severity === "fail");
    const hasWarn = issues.some((i) => i.severity === "warn");
    const status: QcStatus = hasFail ? "fail" : hasWarn ? "warn" : "pass";

    return {
      status,
      sample_rate,
      channels,
      duration_secs,
      lufs_integrated,
      true_peak_dbtp,
      silence_ratio,
      issues,
      checked_at,
    };
  } finally {
    await fs.unlink(tmp).catch(() => undefined);
  }
}

export function qcFieldsForDb(qc: AudioQcResult): Record<string, unknown> {
  return {
    qc_status: qc.status,
    qc_checked_at: qc.checked_at,
    qc_sample_rate: qc.sample_rate,
    qc_channels: qc.channels,
    qc_lufs_integrated: qc.lufs_integrated,
    qc_true_peak_dbtp: qc.true_peak_dbtp,
    qc_silence_ratio: qc.silence_ratio,
    qc_issues: qc.issues,
  };
}

export function qcBlocksGoLive(status: string | null | undefined): boolean {
  return (status || "").toLowerCase() === "fail";
}

export function formatQcSummary(qc: Pick<AudioQcResult, "status" | "lufs_integrated" | "true_peak_dbtp" | "issues">): string {
  const bits: string[] = [`QC ${qc.status.toUpperCase()}`];
  if (qc.lufs_integrated != null) {
    bits.push(`${qc.lufs_integrated.toFixed(1)} LUFS`);
  }
  if (qc.true_peak_dbtp != null) {
    bits.push(`peak ${qc.true_peak_dbtp.toFixed(1)} dBTP`);
  }
  const fails = qc.issues.filter((i) => i.severity === "fail").map((i) => i.message);
  if (fails[0]) bits.push(fails[0]);
  return bits.join(" · ");
}
