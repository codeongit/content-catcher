export const ANALYSIS_SETTINGS_KEY = "content-catcher.analysis-settings.v1";
export const DEFAULT_ANALYSIS_SETTINGS = Object.freeze({
  preferences: "",
  feedbackOutputRoot: "/Users/chenghao/Documents/Code/content-catcher/.content-catcher/runs",
  archiveOutputRoot: "/Users/chenghao/Documents/Obsidian Vault/文章收藏"
});

function normalizeAbsolutePath(value, label) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    throw new Error(`${label}不能包含换行或控制字符。`);
  }
  const normalized = value.trim();
  const absolute = normalized.startsWith("/")
    || /^[a-z]:[\\/]/i.test(normalized)
    || /^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(normalized);
  if (!absolute) throw new Error(`${label}必须是 POSIX 或 Windows 绝对目录。`);
  return normalized;
}

export function normalizeAnalysisSettings(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("分析设置格式无效。");
  }
  const preferences = options.preferences ?? DEFAULT_ANALYSIS_SETTINGS.preferences;
  if (typeof preferences !== "string") throw new Error("分析偏好必须是文字。");
  const feedbackOutputRoot = normalizeAbsolutePath(
    options.feedbackOutputRoot ?? DEFAULT_ANALYSIS_SETTINGS.feedbackOutputRoot,
    "反馈保存目录"
  );
  const archiveOutputRoot = normalizeAbsolutePath(
    options.archiveOutputRoot ?? DEFAULT_ANALYSIS_SETTINGS.archiveOutputRoot,
    "Obsidian 收藏目录"
  );
  return { preferences: preferences.trim(), feedbackOutputRoot, archiveOutputRoot };
}

export function loadAnalysisSettings(storage) {
  const saved = storage.getItem(ANALYSIS_SETTINGS_KEY);
  return saved === null ? { ...DEFAULT_ANALYSIS_SETTINGS } : normalizeAnalysisSettings(JSON.parse(saved));
}

export function saveAnalysisSettings(storage, candidate) {
  const settings = normalizeAnalysisSettings(candidate);
  storage.setItem(ANALYSIS_SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}
