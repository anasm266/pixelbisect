export interface Viewport {
  width: number;
  height: number;
}

export interface PixelBisectConfig {
  repoPath: string;
  goodCommit: string;
  badCommit: string;
  installCommand: string;
  buildCommand: string | null;
  startCommand: string;
  port: number;
  readinessUrl: string;
  targetUrl: string;
  selector: string;
  viewport: Viewport;
  startupTimeoutMs: number;
  captureTimeoutMs: number;
  pixelColorThreshold: number;
  maxChangedPixelPercent: number;
}

export interface ResolvedConfig extends PixelBisectConfig {
  repoPath: string;
  configPath: string;
  goodHash: string;
  badHash: string;
  commitCount: number;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
  body: string;
}

export interface ComparisonResult {
  changedPixels: number;
  totalPixels: number;
  changedPercent: number;
  verdict: 'GOOD' | 'BAD';
  width: number;
  height: number;
}

export interface EvaluationRecord extends ComparisonResult {
  hash: string;
  shortHash: string;
  subject: string;
  durationMs: number;
  screenshotPath: string;
  diffPath: string;
  timestamp: string;
}

export interface EvaluationState {
  version: 1;
  startedAt: number;
  config: ResolvedConfig;
  worktreePath: string;
  artifactDir: string;
  baselinePath: string;
  resultsPath: string;
  installStatePath: string;
  expectedComparisons: number;
}

export interface RunResult {
  reportPath: string;
  artifactDir: string;
  culprit: CommitInfo;
  lastGood: CommitInfo;
  comparison: ComparisonResult;
  records: EvaluationRecord[];
  durationMs: number;
  diffText: string;
}
