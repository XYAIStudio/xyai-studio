import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import type { HardwareGpu, HardwareProfile } from '@xyai/contracts';
import { detectHardwareUsage } from './hardware-usage.js';

const execFileAsync = promisify(execFile);

async function run(
  cmd: string,
  args: string[],
  timeoutMs = 8000,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      windowsHide: true,
      encoding: 'utf8',
    });
    return String(stdout ?? '');
  } catch {
    return '';
  }
}

function parseNvidiaSmi(csv: string): HardwareGpu[] {
  const gpus: HardwareGpu[] = [];
  for (const line of csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    // name, memory.total [MiB], driver
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 2) continue;
    const name = parts[0]!;
    const mem = Number.parseInt(parts[1]!.replace(/[^\d]/g, ''), 10);
    gpus.push({
      name,
      vramTotalMb: Number.isFinite(mem) ? mem : null,
      vendor: 'nvidia',
    });
  }
  return gpus;
}

async function windowsGpusFallback(): Promise<HardwareGpu[]> {
  const ps = `
Get-CimInstance Win32_VideoController | ForEach-Object {
  $ram = $_.AdapterRAM
  $mb = if ($ram -and $ram -gt 0 -and $ram -lt 0xFFFFFFFF) { [int]($ram/1MB) } else { 0 }
  Write-Output (($_.Name) + '|' + $mb)
}
`.trim();
  const out = await run('powershell.exe', [
    '-NoProfile',
    '-Command',
    ps,
  ]);
  const gpus: HardwareGpu[] = [];
  for (const line of out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [name, mbStr] = line.split('|');
    if (!name) continue;
    const lower = name.toLowerCase();
    let vendor: HardwareGpu['vendor'] = 'other';
    if (lower.includes('nvidia') || lower.includes('geforce') || lower.includes('rtx'))
      vendor = 'nvidia';
    else if (lower.includes('amd') || lower.includes('radeon')) vendor = 'amd';
    else if (lower.includes('intel')) vendor = 'intel';
    const mb = Number.parseInt(mbStr ?? '0', 10);
    gpus.push({
      name,
      vramTotalMb: mb > 0 ? mb : null,
      vendor,
    });
  }
  return gpus;
}

export async function detectHardware(): Promise<HardwareProfile> {
  const cpus = os.cpus();
  const cpuName = cpus[0]?.model?.trim() || 'Unknown CPU';
  const cpuCores = cpus.length;
  const ramTotalMb = Math.round(os.totalmem() / (1024 * 1024));

  let gpus: HardwareGpu[] = [];
  const smi = await run('nvidia-smi', [
    '--query-gpu=name,memory.total,driver_version',
    '--format=csv,noheader,nounits',
  ]);
  if (smi.trim()) {
    gpus = parseNvidiaSmi(smi);
  }
  if (gpus.length === 0 && process.platform === 'win32') {
    gpus = await windowsGpusFallback();
  }
  if (gpus.length === 0) {
    gpus = [
      {
        name: 'Integrated / Unknown',
        vramTotalMb: null,
        vendor: 'other',
      },
    ];
  }

  const nvidia = gpus.filter((g) => g.vendor === 'nvidia' && g.vramTotalMb);
  const primaryVramMb =
    nvidia.sort((a, b) => (b.vramTotalMb ?? 0) - (a.vramTotalMb ?? 0))[0]
      ?.vramTotalMb ??
    gpus.map((g) => g.vramTotalMb ?? 0).sort((a, b) => b - a)[0] ??
    0;

  const usage = await detectHardwareUsage(gpus);
  return {
    platform: process.platform,
    cpuName,
    cpuCores,
    ramTotalMb,
    ramUsedMb: usage.ramUsedMb,
    ramUsedPct: usage.ramUsedPct,
    gpus,
    primaryVramMb,
    usage,
    collectedAt: new Date().toISOString(),
  };
}
