import assert from "node:assert/strict";
import test from "node:test";
import {
  ANALYSIS_SETTINGS_KEY, DEFAULT_ANALYSIS_SETTINGS,
  loadAnalysisSettings, normalizeAnalysisSettings, saveAnalysisSettings
} from "../extension/analysis-settings.js";

test("Settings round-trip only preferences and destinations, with fresh defaults", () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const defaults = loadAnalysisSettings(storage);
  assert.deepEqual(defaults, DEFAULT_ANALYSIS_SETTINGS);
  defaults.preferences = "temporary";
  assert.equal(DEFAULT_ANALYSIS_SETTINGS.preferences, "");
  const saved = saveAnalysisSettings(storage, {
    preferences: "  简短一点\n少用表格  ",
    feedbackOutputRoot: "  /tmp/反馈记录  ",
    archiveOutputRoot: "  /tmp/文章收藏  ",
    article: "不得存储的文章"
  });
  assert.deepEqual(loadAnalysisSettings(storage), saved);
  assert.equal(saved.preferences, "简短一点\n少用表格");
  assert.equal(saved.feedbackOutputRoot, "/tmp/反馈记录");
  assert.equal(saved.archiveOutputRoot, "/tmp/文章收藏");
  assert.deepEqual([...data.keys()], [ANALYSIS_SETTINGS_KEY]);
  assert.doesNotMatch(data.get(ANALYSIS_SETTINGS_KEY), /不得存储的文章/);
  saveAnalysisSettings(storage, DEFAULT_ANALYSIS_SETTINGS);
  assert.deepEqual(loadAnalysisSettings(storage), DEFAULT_ANALYSIS_SETTINGS);
});

test("Both destinations accept absolute POSIX, Windows drive and UNC paths", () => {
  for (const path of ["/tmp/feedback", "/Users/demo/My Notes", "C:\\feedback", "D:/My Notes", "\\\\server\\share\\feedback"]) {
    assert.equal(normalizeAnalysisSettings({ feedbackOutputRoot: path }).feedbackOutputRoot, path);
    assert.equal(normalizeAnalysisSettings({ archiveOutputRoot: path }).archiveOutputRoot, path);
  }
  for (const path of ["", "   ", "notes", "./notes", "../notes", "~/notes", "$HOME/notes", "C:notes", "\\notes", "\\\\server", "/tmp/notes\n", "/tmp/\t/notes", "/tmp/\u0000notes", "/tmp/\u007fnotes", "/tmp/\u0085notes"]) {
    assert.throws(() => normalizeAnalysisSettings({ feedbackOutputRoot: path }), Error, JSON.stringify(path));
    assert.throws(() => normalizeAnalysisSettings({ archiveOutputRoot: path }), Error, JSON.stringify(path));
  }
});

test("Legacy settings gain the default archive directory without an eager storage write", () => {
  const legacy = { preferences: "保留原偏好", feedbackOutputRoot: "/tmp/feedback" };
  let writes = 0;
  const loaded = loadAnalysisSettings({
    getItem: () => JSON.stringify(legacy),
    setItem: () => { writes += 1; }
  });
  assert.deepEqual(loaded, { ...legacy, archiveOutputRoot: DEFAULT_ANALYSIS_SETTINGS.archiveOutputRoot });
  assert.equal(writes, 0);
});

test("Storage and malformed settings failures reach the UI instead of masquerading as saved", () => {
  for (const raw of ["{", "null", "[]", '{"preferences":1}', '{"feedbackOutputRoot":"relative"}', '{"archiveOutputRoot":"relative"}']) {
    assert.throws(() => loadAnalysisSettings({ getItem: () => raw }));
  }
  assert.throws(() => loadAnalysisSettings({ getItem: () => { throw new Error("blocked"); } }), /blocked/);
  assert.throws(() => saveAnalysisSettings({ setItem: () => { throw new Error("quota"); } }, DEFAULT_ANALYSIS_SETTINGS), /quota/);
  let writes = 0;
  assert.throws(() => saveAnalysisSettings({ setItem: () => { writes += 1; } }, { feedbackOutputRoot: "relative" }));
  assert.equal(writes, 0);
});
