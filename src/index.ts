#!/usr/bin/env node
/**
 * CLI entry — installable like `pi`:
 *   npm i -g baribari  →  baribari
 *
 * Config & models: ~/.config/baribari  (BARIBARI_CONFIG_DIR)
 * First run: setup guide / optional download.
 */

import { createRequire } from "node:module";
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import {
  defaultSource,
  listInputDevices,
  transcribe,
} from "./transcribe.js";
import type { AudioSource, Lang, Segment, TranscribeArgs, UiLang } from "./types.js";
import { DEFAULT_AI, DEFAULT_SHARE, DEFAULT_VAD } from "./types.js";
import { createEmitter, onStatus as plainStatus } from "./ui.js";
import { createTui } from "./tui.js";
import {
  defaultRecordDir,
  flushSaveSettings,
  loadSettings,
  mergeAi,
  mergeShare,
  mergeVad,
  modelOverridesFromSettings,
  normalizeRecordDir,
  snapshotFromArgs,
} from "./settings.js";
import { aiActive, createAiPipeline, resolveApiKey } from "./ai.js";
import { startShareServer, type ShareServer } from "./share-server.js";
import { joinShareSession } from "./share-client.js";
import {
  checkModels,
  configDir,
  ensureConfigDir,
  packageRoot,
} from "./paths.js";
import {
  ensureReadyForAsr,
  ensureUiLang,
  printPaths,
  runSetup,
} from "./setup.js";
import {
  detectUiLang,
  getUiLang,
  isUiLang,
  resolveUiLang,
  setUiLang,
  t,
  UI_LANGS,
  uiLangLabel,
} from "./i18n/index.js";
import {
  createSessionWriter,
  deleteSession,
  DEMO_SESSION_ID,
  formatSessionRow,
  listSessions,
  loadSession,
  openSessionWriter,
  resolveSessionForDelete,
  type SessionSpeaker,
  type SessionWriter,
} from "./session.js";
import readline from "node:readline";
import { runResumeTui } from "./resume-tui.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { name: string; version: string };

const LANGS: Lang[] = ["auto", "zh", "en", "ja", "ko", "yue"];
const SOURCES: AudioSource[] = ["mic", "loopback", "both"];

function hasFlag(...names: string[]): boolean {
  const argv = process.argv.slice(2);
  return names.some((n) =>
    argv.some((a) => a === n || a.startsWith(`${n}=`)),
  );
}

function hardExit(code: number): never {
  try {
    process.exitCode = code;
  } catch {
    /* ignore */
  }
  process.exit(code);
}

function readUiLangFlag(argv: string[] = process.argv): string | undefined {
  const flagIdx = argv.findIndex(
    (a) => a === "--ui-lang" || a.startsWith("--ui-lang="),
  );
  if (flagIdx < 0) return undefined;
  const a = argv[flagIdx]!;
  if (a.includes("=")) return a.split("=")[1];
  return argv[flagIdx + 1];
}

function printDevices(): void {
  const devices = listInputDevices();
  if (!devices.length) {
    console.log(t("cli.noDevices"));
    hardExit(1);
  }
  console.log(`${t("cli.listDevices")}:\n`);
  devices.forEach((d, i) => {
    console.log(`  [${i}]  ${d.name}`);
  });
  if (process.platform === "win32") {
    console.log("\n" + t("cli.sourceHint"));
  }
}

/** Confirm by typing expected string (or y/yes when expected is empty). */
function confirmPrompt(message: string, expectedId: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error("Refusing to delete without TTY; pass --yes");
    return Promise.resolve(false);
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(message, (ans) => {
      rl.close();
      const a = ans.trim();
      resolve(a === expectedId);
    });
  });
}

function printSessionList(): void {
  const list = listSessions();
  if (!list.length) {
    console.log(t("cli.noSessions"));
    return;
  }
  console.log(
    `${"ID".padEnd(20)}  ${"UPDATED".padEnd(18)}  ${"SEGS".padStart(4)}      ${"DUR".padStart(8)}  ${"MEDIA".padEnd(5)}  NAME`,
  );
  console.log("─".repeat(88));
  for (const m of list) {
    console.log(formatSessionRow(m));
  }
  console.log("");
  console.log(t("cli.sessionListHintResume"));
  console.log(t("cli.sessionListHintDelete"));
  console.log(t("cli.sessionListHintDemo"));
}

async function runResume(id: string): Promise<void> {
  const data = loadSession(id);
  if (!data) {
    console.error(t("cli.sessionNotFound", { id }));
    console.error(t("cli.listSessionsHint"));
    hardExit(1);
  }
  const action = await runResumeTui(data);
  if (action.type === "continue") {
    const saved = loadSettings();
    setUiLang(resolveUiLang({ flag: readUiLangFlag(), saved: saved.uiLang }));
    const args = buildArgsFromSaved(saved, {
      // keep prior source/lang when possible
      source: (data.meta.source as AudioSource | undefined) || undefined,
      lang: (data.meta.lang as Lang | undefined) || undefined,
    });
    const stop = { value: false };
    const writer = openSessionWriter(action.sessionId, {
      source: args.source,
      lang: args.lang,
    });
    if (!writer) {
      console.error(
        t("cli.cannotContinue", { id: action.sessionId }),
      );
      hardExit(1);
    }
    // Continue may record into session/audio.wav (previous wav rotated to audio-part-*.wav)
    args.recordDir = writer.dir;
    // Don't force-record on continue unless user already had --record; toggle r in TUI
    args.record = undefined;
    await runTui(args, stop, writer);
    return;
  }
  hardExit(0);
}

/** Build TranscribeArgs from saved settings + optional overrides (for continue). */
function buildArgsFromSaved(
  saved: ReturnType<typeof loadSettings>,
  over?: { source?: AudioSource; lang?: Lang },
): TranscribeArgs {
  const lang = (over?.lang || saved.lang || "auto") as Lang;
  const source = (over?.source ||
    saved.source ||
    defaultSource()) as AudioSource;
  return {
    lang: LANGS.includes(lang) ? lang : "auto",
    device: saved.device,
    source: SOURCES.includes(source) ? source : defaultSource(),
    output: saved.output,
    noSpk: saved.noSpk ?? false,
    spkThreshold: saved.spkThreshold ?? 0.55,
    noTui: false,
    recordDir: saved.recordDir
      ? normalizeRecordDir(saved.recordDir)
      : defaultRecordDir(),
    paused: { value: false },
    ai: mergeAi(saved.ai),
    share: mergeShare(saved.share),
    vad: mergeVad(saved.vad),
    uiLang: resolveUiLang({ saved: saved.uiLang }),
  };
}

function printDoctor(): void {
  const saved = loadSettings();
  setUiLang(resolveUiLang({ flag: readUiLangFlag(), saved: saved.uiLang }));
  ensureConfigDir();
  const overrides = modelOverridesFromSettings();
  const check = checkModels(overrides, { requireSpk: !saved.noSpk });
  const p = check.paths;
  const ok = (b: boolean) => (b ? "✓" : "✗");
  const exists = (f: string) => fs.existsSync(f);

  console.log(`baribari doctor  v${pkg.version}`);
  console.log("");
  console.log("Environment");
  console.log(`  node        ${process.version}`);
  console.log(`  platform    ${process.platform} ${process.arch}`);
  console.log(`  cwd         ${process.cwd()}`);
  console.log(`  package     ${packageRoot()}`);
  console.log("");
  console.log("Config");
  console.log(`  configDir   ${configDir()}`);
  console.log(`  config.json ${ok(exists(path.join(configDir(), "config.json")))}  ${path.join(configDir(), "config.json")}`);
  console.log(`  uiLang      ${uiLangLabel(getUiLang())} (${getUiLang()})`);
  console.log(`  asr lang    ${saved.lang ?? "auto"}`);
  console.log(`  source      ${saved.source ?? defaultSource()}`);
  console.log("");
  console.log("Models");
  console.log(`  modelsDir   ${p.modelsDir}`);
  console.log(`  vad         ${ok(exists(p.vad))}  ${p.vad}`);
  console.log(`  asr model   ${ok(exists(p.senseVoiceModel))}  ${p.senseVoiceModel}`);
  console.log(`  asr tokens  ${ok(exists(p.senseVoiceTokens))}  ${p.senseVoiceTokens}`);
  console.log(`  speaker     ${ok(exists(p.spk))}  ${p.spk}`);
  if (check.missing.length) {
    console.log("");
    console.log("Missing:");
    for (const m of check.missing) console.log(`  - [${m.key}] ${m.path}`);
    console.log(`\nFix: baribari setup --download`);
  }
  console.log("");
  console.log("AI");
  const ai = mergeAi(saved.ai);
  const key = resolveApiKey(ai);
  console.log(`  enabled     ${ai.enabled ? "yes" : "no"}`);
  console.log(`  active      ${aiActive(ai) ? "yes" : "no"}`);
  console.log(`  baseUrl     ${ai.baseUrl}`);
  console.log(`  model       ${ai.model}`);
  console.log(`  apiKey      ${key ? "set (" + key.slice(0, 3) + "…)" : "missing"}`);
  console.log(`  translate   ${ai.translateTo || "off"}`);
  console.log("");
  console.log("Share");
  const share = mergeShare(saved.share);
  console.log(`  enabled     ${share.enabled ? "yes" : "no"}`);
  console.log(`  port        ${share.port}`);
  console.log(`  host        ${share.host}`);
  console.log("");
  console.log(t("cli.doctorAudioDevices"));
  try {
    const devices = listInputDevices();
    if (!devices.length) console.log("  (none found)");
    else devices.slice(0, 8).forEach((d, i) => console.log(`  [${i}] ${d.name}`));
    if (devices.length > 8) console.log(`  … +${devices.length - 8} more`);
  } catch (e) {
    console.log(`  error: ${e instanceof Error ? e.message : e}`);
  }
  console.log("");
  console.log(
    check.ok ? t("cli.doctorStatusReady") : t("cli.doctorStatusNeedsSetup"),
  );
  hardExit(check.ok ? 0 : 1);
}

function printCompletion(shell: string): void {
  const name = "baribari";
  const s = shell.toLowerCase();
  if (s === "bash") {
    console.log(`# bash completion for ${name}
# Add to ~/.bashrc:  eval "$(${name} completion bash)"
_${name}_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local cmds="setup paths config devices doctor demo join session sessions resume completion help"
  local opts="--lang --ui-lang --source --device --output --no-spk --spk-threshold --no-tui --record --record-dir --ai --no-ai --ai-translate --ai-base-url --ai-model --ai-key --share --no-share --share-port --join --vad-threshold --vad-min-speech --vad-min-silence --vad-max-speech --vad-window --list-devices --demo --help --version"
  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${cmds} \${opts}" -- "\${cur}") )
  else
    COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
  fi
}
complete -F _${name}_completions ${name}
`);
  } else if (s === "zsh") {
    console.log(`# zsh completion for ${name}
# Add to ~/.zshrc:  eval "$(${name} completion zsh)"
#compdef ${name}
_${name}() {
  local -a cmds opts
  cmds=(setup paths config devices doctor demo join session sessions resume completion help)
  opts=(--lang --ui-lang --source --device --output --no-spk --spk-threshold --no-tui --record --record-dir --ai --no-ai --ai-translate --ai-base-url --ai-model --ai-key --share --no-share --share-port --join --vad-threshold --vad-min-speech --vad-min-silence --vad-max-speech --vad-window --list-devices --demo --help --version)
  _arguments \\
    '1:command:(\${cmds})' \\
    '*::options:->opts'
  case \$state in
    opts) _arguments \${opts} ;;
  esac
}
compdef _${name} ${name}
`);
  } else if (s === "fish") {
    console.log(`# fish completion for ${name}
# Save as ~/.config/fish/completions/${name}.fish
complete -c ${name} -f
complete -c ${name} -n "__fish_use_subcommand" -a "setup" -d "Install / check models"
complete -c ${name} -n "__fish_use_subcommand" -a "paths" -d "Print config paths"
complete -c ${name} -n "__fish_use_subcommand" -a "devices" -d "List audio devices"
complete -c ${name} -n "__fish_use_subcommand" -a "doctor" -d "Health check"
complete -c ${name} -n "__fish_use_subcommand" -a "demo" -d "Demo TUI"
complete -c ${name} -n "__fish_use_subcommand" -a "join" -d "Join LAN share"
complete -c ${name} -n "__fish_use_subcommand" -a "session" -d "List/delete sessions"
complete -c ${name} -n "__fish_use_subcommand" -a "resume" -d "Replay a session"
complete -c ${name} -n "__fish_use_subcommand" -a "completion" -d "Shell completion"
complete -c ${name} -l lang -d "ASR language"
complete -c ${name} -l ui-lang -d "UI language"
complete -c ${name} -l source -d "Audio source"
complete -c ${name} -l help -d "Help"
complete -c ${name} -l version -d "Version"
`);
  } else if (s === "powershell" || s === "pwsh") {
    console.log(`# PowerShell completion for ${name}
# Add to $PROFILE:  ${name} completion powershell | Out-String | Invoke-Expression
Register-ArgumentCompleter -Native -CommandName ${name} -ScriptBlock {
  param(\$wordToComplete, \$commandAst, \$cursorPosition)
  \$cmds = @('setup','paths','config','devices','doctor','demo','join','session','resume','completion','help')
  \$opts = @('--lang','--ui-lang','--source','--device','--output','--ai','--share','--join','--help','--version')
  (\$cmds + \$opts) | Where-Object { \$_ -like "\$wordToComplete*" } | ForEach-Object {
    [System.Management.Automation.CompletionResult]::new(\$_, \$_, 'ParameterValue', \$_)
  }
}
`);
  } else {
    console.error(t("cli.unknownShell", { shell }));
    hardExit(2);
  }
}

function addRunOptions(cmd: Command): Command {
  return cmd
    .option("--lang <lang>", `${t("cli.lang")}: ${LANGS.join("|")}`)
    .option("--ui-lang <lang>", t("cli.uiLang"))
    .option("--device <id>", t("cli.deviceOpt"))
    .option("--list-devices", t("cli.listDevices"))
    .option("--source <src>", `${t("cli.sourceOpt")} (${SOURCES.join("|")})`)
    .option("-o, --output <file>", t("cli.outputOpt"))
    .option("--no-spk", t("cli.noSpk"))
    .option("--spk-threshold <n>", t("cli.spkThreshold"), (v) => parseFloat(v))
    .option("--no-tui", t("cli.noTui"))
    .option("--record <path>", t("cli.record"))
    .option("--record-dir <dir>", t("cli.recordDir"))
    .option("--ai", t("cli.ai"))
    .option("--no-ai", t("cli.noAi"))
    .option("--ai-correct", t("cli.aiCorrect"))
    .option("--no-ai-correct", t("cli.noAiCorrect"))
    .option("--ai-translate <lang>", t("cli.aiTranslate"))
    .option("--ai-base-url <url>", t("cli.aiBaseUrl"))
    .option("--ai-model <id>", t("cli.aiModel"))
    .option("--ai-key <key>", t("cli.aiKey"))
    .option("--share", t("cli.share"))
    .option("--no-share", t("cli.noShare"))
    .option("--share-port <n>", t("cli.sharePort"), (v) => parseInt(v, 10))
    .option("--join <url>", t("cli.join"))
    .option("--vad-threshold <n>", t("cli.vadThreshold"), (v) => parseFloat(v))
    .option(
      "--vad-min-speech <sec>",
      t("cli.vadMinSpeech"),
      (v) => parseFloat(v),
    )
    .option(
      "--vad-min-silence <sec>",
      t("cli.vadMinSilence"),
      (v) => parseFloat(v),
    )
    .option(
      "--vad-max-speech <sec>",
      t("cli.vadMaxSpeech"),
      (v) => parseFloat(v),
    )
    .option(
      "--vad-window <samples>",
      t("cli.vadWindow"),
      (v) => parseInt(v, 10),
    )
    .option("--demo", t("cli.demo"));
}

async function main() {
  ensureConfigDir();
  const argv = process.argv.slice(2);
  const skipLangPrompt =
    argv.includes("--help") ||
    argv.includes("-h") ||
    argv.includes("--version") ||
    argv.includes("-V") ||
    argv.includes("--list-devices") ||
    argv[0] === "completion" ||
    argv[0] === "doctor" ||
    argv[0] === "paths" ||
    argv[0] === "config" ||
    argv[0] === "devices" ||
    argv[0] === "session" ||
    argv[0] === "sessions" ||
    argv[0] === "resume" ||
    argv[0] === "demo" ||
    argv[0] === "help";

  // Resolve UI language early (except pure meta commands)
  if (!skipLangPrompt || argv.includes("--ui-lang") || argv.some((a) => a.startsWith("--ui-lang="))) {
    await ensureUiLang({
      flag: readUiLangFlag(),
      skipPrompt: skipLangPrompt,
    });
  } else {
    const saved = loadSettings();
    setUiLang(resolveUiLang({ flag: readUiLangFlag(), saved: saved.uiLang }));
  }

  const program = new Command();
  program
    .name("baribari")
    .description(
      `${t("app.desc")}\n\n` +
        `Config: ${configDir()}\n` +
        `Docs:   https://github.com/QinYangWang/baribari`,
    )
    .version(pkg.version, "-V, --version", t("cli.version"))
    .helpOption("-h, --help", t("cli.help"))
    .addHelpText("after", t("cli.helpExamples"))
    .showHelpAfterError(true)
    .showSuggestionAfterError(true);

  // default command = run
  addRunOptions(program).action(async (_opts, cmd) => {
    await runMain(cmd.opts());
  });

  program
    .command("setup")
    .description(t("cli.cmdSetup"))
    .option("-d, --download", t("cli.setupDownload"))
    .option("-y, --yes", t("cli.setupYes"))
    .option("--skip-spk", t("cli.setupSkipSpk"))
    .option("--no-spk", t("cli.setupNoSpk"))
    .option("--models-dir <dir>", t("cli.setupModelsDir"))
    .option("--ui-lang <lang>", t("cli.uiLang"))
    .action(async (opts) => {
      const ok = await runSetup({
        download: !!opts.download,
        yes: !!opts.yes,
        skipSpk: !!(opts.skipSpk || opts.spk === false),
        modelsDir: opts.modelsDir,
        uiLangFlag: opts.uiLang ?? readUiLangFlag(),
      });
      hardExit(ok ? 0 : 1);
    });

  program
    .command("paths")
    .alias("config")
    .description(t("cli.cmdPaths"))
    .action(() => {
      printPaths();
      hardExit(0);
    });

  program
    .command("devices")
    .alias("ls-devices")
    .description(t("cli.cmdDevices"))
    .action(() => {
      printDevices();
      hardExit(0);
    });

  program
    .command("doctor")
    .description(t("cli.cmdDoctor"))
    .action(() => {
      printDoctor();
    });

  program
    .command("demo")
    .description(t("cli.cmdDemo"))
    .action(async () => {
      await runResume(DEMO_SESSION_ID);
    });

  program
    .command("join")
    .description(t("cli.cmdJoin"))
    .argument("<url>", t("cli.joinUrl"))
    .option("--no-tui", t("cli.noTui"))
    .option("-o, --output <file>", t("cli.outputOpt"))
    .action(async (url: string, opts: { tui?: boolean; output?: string }) => {
      await runJoin(url, {
        noTui: opts.tui === false || !process.stdout.isTTY,
        output: opts.output,
      });
    });

  const sessionCmd = program
    .command("session")
    .alias("sessions")
    .description(t("cli.cmdSession"));

  sessionCmd
    .command("list")
    .alias("ls")
    .description(t("cli.sessionList"))
    .action(() => {
      printSessionList();
      hardExit(0);
    });

  sessionCmd
    .command("rm")
    .alias("delete")
    .description(t("cli.sessionRm"))
    .argument("<id>", "Exact session id (use --allow-prefix for unique prefix)")
    .option("-y, --yes", "Skip confirmation prompt")
    .option(
      "--allow-prefix",
      "Allow unique id prefix (default: exact id only)",
    )
    .action(async (id: string, opts: { yes?: boolean; allowPrefix?: boolean }) => {
      if (id === "demo" || id === DEMO_SESSION_ID) {
        console.error(t("cli.cannotDeleteDemo"));
        hardExit(1);
      }
      const resolved = resolveSessionForDelete(id, {
        allowPrefix: !!opts.allowPrefix,
      });
      if (!resolved.ok) {
        if (resolved.reason === "ambiguous" && resolved.matches?.length) {
          console.error(`Ambiguous id "${id}". Matches:`);
          for (const m of resolved.matches) {
            console.error(`  ${m.id}  ${m.name}`);
          }
          console.error("Use the full session id.");
        } else if (resolved.reason === "need_exact" && resolved.matches?.[0]) {
          const m = resolved.matches[0];
          console.error(
            `Prefix matches ${m.id}. Pass the full id, or: baribari session rm ${id} --allow-prefix`,
          );
        } else if (resolved.reason === "demo") {
          console.error(t("cli.cannotDeleteDemo"));
        } else {
          console.error(t("cli.sessionNotFound", { id }));
        }
        hardExit(1);
      }

      if (!opts.yes) {
        const ok = await confirmPrompt(
          `Delete session ${resolved.id}?\n  ${resolved.path}\nType the full id to confirm: `,
          resolved.id,
        );
        if (!ok) {
          console.log("Aborted.");
          hardExit(1);
        }
      }

      const del = deleteSession(resolved.id, { allowPrefix: false });
      if (!del.ok) {
        console.error(t("cli.sessionNotFound", { id }));
        hardExit(1);
      }
      console.log(t("cli.deletedSession", { id: del.id }));
      hardExit(0);
    });

  sessionCmd
    .command("path")
    .description(t("cli.sessionPath"))
    .argument("<id>", t("cli.sessionPathId"))
    .action((id: string) => {
      const s = loadSession(id);
      if (!s) {
        console.error(t("cli.sessionNotFound", { id }));
        hardExit(1);
      }
      console.log(s.meta.path);
      hardExit(0);
    });

  // bare `session` → list
  sessionCmd.action(() => {
    printSessionList();
    hardExit(0);
  });

  program
    .command("resume")
    .description(t("cli.cmdResume"))
    .argument("[id]", t("cli.resumeId"), "demo")
    .action(async (id: string) => {
      await runResume(id || "demo");
    });

  program
    .command("completion")
    .description(t("cli.cmdCompletion"))
    .argument("[shell]", t("cli.completionShell"), "bash")
    .action((shell: string) => {
      printCompletion(shell);
      hardExit(0);
    });

  // Legacy top-level flags still work via default action
  await program.parseAsync(process.argv);
}

type RunOpts = {
  lang?: string;
  uiLang?: string;
  device?: string;
  listDevices?: boolean;
  source?: string;
  output?: string;
  spk: boolean;
  spkThreshold?: number;
  tui: boolean;
  record?: string;
  recordDir?: string;
  ai?: boolean;
  aiCorrect?: boolean;
  aiTranslate?: string;
  aiBaseUrl?: string;
  aiModel?: string;
  aiKey?: string;
  share?: boolean;
  sharePort?: number;
  join?: string;
  vadThreshold?: number;
  vadMinSpeech?: number;
  vadMinSilence?: number;
  vadMaxSpeech?: number;
  vadWindow?: number;
  demo?: boolean;
};

async function runMain(opts: RunOpts) {
  const saved = loadSettings();
  const recDefault = defaultRecordDir();

  if (opts.demo) {
    await runResume(DEMO_SESSION_ID);
    return;
  }

  if (opts.listDevices) {
    printDevices();
    return;
  }

  // ── join mode: no local ASR ───────────────────────────
  if (opts.join) {
    await runJoin(opts.join, {
      noTui: opts.tui === false || !process.stdout.isTTY,
      output: opts.output ?? saved.output,
    });
    return;
  }

  // merge: CLI explicit > saved > defaults
  const lang = (hasFlag("--lang")
    ? opts.lang
    : (saved.lang ?? opts.lang ?? "auto")) as string;
  const source = (hasFlag("--source")
    ? opts.source
    : (saved.source ?? opts.source ?? defaultSource())) as string;
  const device = hasFlag("--device")
    ? opts.device
    : (opts.device ?? saved.device);
  const spkThreshold = hasFlag("--spk-threshold")
    ? (opts.spkThreshold as number)
    : (saved.spkThreshold ?? opts.spkThreshold ?? 0.55);
  const noSpk = hasFlag("--no-spk")
    ? opts.spk === false
    : (saved.noSpk ?? opts.spk === false);
  const output = hasFlag("-o", "--output")
    ? opts.output
    : (opts.output ?? saved.output);
  const recordDir = normalizeRecordDir(
    hasFlag("--record-dir")
      ? (opts.recordDir as string)
      : (saved.recordDir ?? opts.recordDir ?? recDefault),
  );

  const ai = mergeAi(saved.ai);
  if (hasFlag("--ai")) ai.enabled = true;
  if (hasFlag("--no-ai")) ai.enabled = false;
  if (hasFlag("--ai-correct")) ai.correct = true;
  if (hasFlag("--no-ai-correct")) ai.correct = false;
  if (hasFlag("--ai-translate") && opts.aiTranslate !== undefined) {
    ai.translateTo = opts.aiTranslate as typeof ai.translateTo;
    if (ai.translateTo) ai.enabled = true;
  }
  if (hasFlag("--ai-base-url") && opts.aiBaseUrl) {
    ai.baseUrl = opts.aiBaseUrl.replace(/\/+$/, "");
  }
  if (hasFlag("--ai-model") && opts.aiModel) ai.model = opts.aiModel;
  if (hasFlag("--ai-key") && opts.aiKey) ai.apiKey = opts.aiKey;

  const share = mergeShare(saved.share);
  if (hasFlag("--share")) share.enabled = true;
  if (hasFlag("--no-share")) share.enabled = false;
  if (hasFlag("--share-port") && opts.sharePort) {
    share.port = Math.min(65535, Math.max(1024, opts.sharePort));
  }

  const vad = mergeVad(saved.vad);
  if (hasFlag("--vad-threshold") && opts.vadThreshold !== undefined) {
    vad.threshold = opts.vadThreshold;
  }
  if (hasFlag("--vad-min-speech") && opts.vadMinSpeech !== undefined) {
    vad.minSpeechDuration = opts.vadMinSpeech;
  }
  if (hasFlag("--vad-min-silence") && opts.vadMinSilence !== undefined) {
    vad.minSilenceDuration = opts.vadMinSilence;
  }
  if (hasFlag("--vad-max-speech") && opts.vadMaxSpeech !== undefined) {
    vad.maxSpeechDuration = opts.vadMaxSpeech;
  }
  if (hasFlag("--vad-window") && opts.vadWindow !== undefined) {
    vad.windowSize = opts.vadWindow;
  }
  // re-merge clamps
  Object.assign(vad, mergeVad(vad));

  if (!LANGS.includes(lang as Lang)) {
    console.error(
      t("cli.invalidLang", { lang, opts: LANGS.join(", ") }),
    );
    process.exit(2);
  }
  if (!SOURCES.includes(source as AudioSource)) {
    console.error(
      t("cli.invalidSource", { source, opts: SOURCES.join(", ") }),
    );
    process.exit(2);
  }

  if (hasFlag("--ui-lang") && opts.uiLang !== undefined && !isUiLang(opts.uiLang)) {
    console.error(
      t("cli.invalidUiLang", {
        lang: String(opts.uiLang),
        opts: UI_LANGS.join(", "),
      }),
    );
    process.exit(2);
  }
  const uiLang: UiLang =
    loadSettings().uiLang ??
    resolveUiLang({ flag: opts.uiLang, saved: saved.uiLang });
  setUiLang(uiLang);

  const useTui = opts.tui !== false && Boolean(process.stdout.isTTY);

  // First run / missing models → interactive setup guide
  const ready = await ensureReadyForAsr({
    requireSpk: !noSpk,
    uiLangFlag: uiLang,
  });
  if (!ready) {
    console.error(t("cli.modelsNotReady"));
    hardExit(1);
  }

  const args: TranscribeArgs = {
    lang: lang as Lang,
    uiLang,
    device,
    source: source as AudioSource,
    output,
    noSpk,
    spkThreshold,
    noTui: !useTui,
    recordDir,
    record: opts.record,
    paused: { value: false },
    ai,
    share,
    vad,
  };

  const stop = { value: false };

  if (useTui) {
    await runTui(args, stop);
  } else {
    await runPlain(args, stop);
  }
}

/** Wire ASR emit → optional AI → UI + optional LAN share. */
function createSegmentPipeline(
  args: TranscribeArgs,
  emitUi: (seg: Segment) => void,
  onStatus: (msg: string) => void,
  onAiBusy?: (busy: boolean) => void,
): {
  onAsr: (seg: Segment) => void;
  close: () => void;
  ensureShare: () => Promise<void>;
} {
  let share: ShareServer | null = null;
  let shareWanted = args.share.enabled;
  let shareStarting = false;

  const deliver = (seg: Segment) => {
    // Don't broadcast provisional AI-pending rows to LAN peers
    if (!seg.pending) {
      seg.wallIso = seg.wall.toISOString();
    }
    emitUi(seg);
    if (share && !seg.pending) {
      try {
        share.broadcast(seg);
      } catch {
        /* ignore */
      }
    }
  };

  const aiPipe = createAiPipeline(
    () => args.ai,
    deliver,
    (msg) => onStatus(`AI: ${msg}`),
    onAiBusy,
  );

  const onAsr = (seg: Segment) => {
    if (aiActive(args.ai)) {
      aiPipe.push(seg);
    } else {
      deliver(seg);
    }
  };

  const ensureShare = async () => {
    shareWanted = args.share.enabled;
    if (!shareWanted) {
      if (share) {
        share.close();
        share = null;
        onStatus(t("status.shareStopped"));
      }
      return;
    }
    if (share) {
      // port change → restart
      if (share.port !== args.share.port) {
        share.close();
        share = null;
      } else {
        return;
      }
    }
    if (shareStarting) return;
    shareStarting = true;
    try {
      share = await startShareServer(args.share.port, {
        title: "baribari meeting",
      });
      const url = share.urls[0] || `http://127.0.0.1:${share.port}/`;
      onStatus(t("status.shareOn", { port: share.port }) + ` · ${url}`);
    } catch (e) {
      onStatus(
        t("status.shareFailed", {
          err: e instanceof Error ? e.message : String(e),
        }),
      );
      args.share.enabled = false;
    } finally {
      shareStarting = false;
    }
  };

  // poll share toggle from TUI settings
  const sharePoll = setInterval(() => {
    if (args.share.enabled !== shareWanted || (args.share.enabled && !share)) {
      void ensureShare();
    }
  }, 500);
  sharePoll.unref?.();

  return {
    onAsr,
    async ensureShare() {
      await ensureShare();
    },
    close() {
      clearInterval(sharePoll);
      aiPipe.close();
      try {
        share?.close();
      } catch {
        /* ignore */
      }
      share = null;
    },
  };
}

async function runTui(
  args: TranscribeArgs,
  stop: { value: boolean },
  existing?: SessionWriter,
) {
  let forceTimer: ReturnType<typeof setTimeout> | null = null;
  let pipe: ReturnType<typeof createSegmentPipeline> | null = null;
  let finalized = false;

  // New session or continue an existing one
  const session =
    existing ||
    createSessionWriter({
      source: args.source,
      lang: args.lang,
    });

  const safeFinalize = () => {
    if (finalized) return;
    finalized = true;
    try {
      session.close();
    } catch {
      /* ignore */
    }
  };

  // Bind recording into session/audio.wav (append on continue via flushWav merge)
  args.recordDir = session.dir;
  if (args.record) {
    args.record = session.recordPath.replace(/\.wav$/i, "");
  }

  const requestStop = (hard = false) => {
    if (hard || stop.value) {
      if (forceTimer) clearTimeout(forceTimer);
      try {
        pipe?.close();
      } catch {
        /* ignore */
      }
      safeFinalize();
      try {
        tui.close();
      } catch {
        /* ignore */
      }
      hardExit(130);
    }
    tui.setStatus(t("status.stopping"));
    stop.value = true;
    forceTimer = setTimeout(() => {
      try {
        pipe?.close();
      } catch {
        /* ignore */
      }
      safeFinalize();
      try {
        tui.close();
      } catch {
        /* ignore */
      }
      hardExit(0);
    }, 800);
  };

  // Crash / kill safety: flush session meta on unexpected exit
  const onCrash = () => {
    safeFinalize();
  };
  process.once("uncaughtException", onCrash);
  process.once("unhandledRejection", onCrash);
  process.once("beforeExit", onCrash);

  const tui = createTui(args, {
    onQuit: () => requestStop(false),
    sessionDir: session.dir,
    sessionId: session.id,
    sessionName: session.meta.name,
    onSessionRenamed: (name) => {
      session.meta.name = name;
    },
  });
  tui.setStatus(
    session.continuing
      ? t("resume.continueBanner", {
          id: session.id,
          offset: Math.round(session.timeOffset),
        })
      : `Session ${session.id}`,
  );

  // When user toggles record on without a path, bind to session audio
  const origRecord = args.record;
  const recordWatch = setInterval(() => {
    if (args.record && args.record.includes("meeting-")) {
      // rewrite live toggle paths into session audio.wav
      const want = session.recordPath.replace(/\.wav$/i, "");
      if (args.record !== want) args.record = want;
    }
    if (!args.record && origRecord === undefined) {
      /* idle */
    }
  }, 300);
  recordWatch.unref?.();

  let statusClearTimer: ReturnType<typeof setTimeout> | null = null;
  const onStatus = (msg: string) => {
    const sep = msg.indexOf(" · ");
    if (sep > 0) {
      const head = msg.slice(0, sep);
      const rest = msg.slice(sep + 3).trim();
      const deviceHead = t("status.deviceDot", { name: "\0" }).split(" · ")[0];
      if (rest && head === deviceHead) tui.setDevice(rest);
    }
    tui.setStatus(msg);
    if (statusClearTimer) clearTimeout(statusClearTimer);
    const idleLabel = session.continuing
      ? t("resume.continueBanner", {
          id: session.id,
          offset: Math.round(session.timeOffset),
        })
      : `Session ${session.id}`;
    statusClearTimer = setTimeout(() => {
      tui.setStatus(idleLabel);
    }, 6000);
    statusClearTimer.unref?.();
  };

  process.on("SIGINT", () => requestStop(false));
  process.on("SIGTERM", () => requestStop(true));

  const speakersFromSeg = (seg: Segment): SessionSpeaker[] | undefined => {
    if (seg.spk == null) return undefined;
    return [
      {
        id: `spk_${seg.spk}`,
        displayName: `Speaker ${seg.spk}`,
        spk: seg.spk,
      },
    ];
  };

  pipe = createSegmentPipeline(
    args,
    (seg) => {
      tui.emit(seg);
      if (!seg.pending) {
        session.onSegment(seg, speakersFromSeg(seg));
      }
    },
    onStatus,
    (busy) => tui.setAiBusy?.(busy),
  );
  await pipe.ensureShare();
  if (aiActive(args.ai)) {
    onStatus(t("status.aiOnModel", { model: args.ai.model }));
  } else if (args.ai.enabled) {
    onStatus(t("status.aiMissingKey"));
  }

  let exitCode = 0;
  try {
    await transcribe(args, pipe.onAsr, stop, onStatus);
  } catch (e) {
    exitCode = 1;
    console.error(e instanceof Error ? e.message : e);
  }
  clearInterval(recordWatch);
  if (forceTimer) clearTimeout(forceTimer);
  try {
    pipe.close();
  } catch {
    /* ignore */
  }
  safeFinalize();
  try {
    flushSaveSettings(() => snapshotFromArgs(args));
  } catch {
    /* ignore */
  }
  try {
    tui.close();
  } catch {
    /* ignore */
  }
  try {
    const tag = session.continuing
      ? t("cli.sessionUpdated")
      : t("cli.sessionSaved");
    console.log(
      t("cli.sessionSaveBanner", {
        tag,
        id: session.id,
        dir: session.dir,
      }),
    );
  } catch {
    /* ignore */
  }
  hardExit(exitCode);
}

async function runPlain(args: TranscribeArgs, stop: { value: boolean }) {
  setUiLang(args.uiLang);
  const { emit, close } = createEmitter(args.output);
  const pipe = createSegmentPipeline(args, emit, plainStatus);

  const onSig = () => {
    if (stop.value) hardExit(130);
    plainStatus(t("status.stopping"));
    stop.value = true;
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  if (process.stdin.isTTY) {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      const cmd = chunk.trim().toLowerCase();
      if (cmd === "q" || cmd === "quit" || cmd === "exit") onSig();
      else if (cmd === "p" || cmd === "pause") {
        args.paused.value = !args.paused.value;
        plainStatus(args.paused.value ? t("plain.paused") : t("plain.resumed"));
      } else if (cmd === "r" || cmd === "record") {
        if (args.record) {
          args.record = undefined;
          plainStatus(t("plain.stopRecord"));
        } else {
          const stamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .slice(0, 19);
          const dir = (args.recordDir || defaultRecordDir()).replace(
            /[/\\]+$/,
            "",
          );
          args.record = `${dir}/meeting-${stamp}`;
          plainStatus(t("plain.startRecord", { path: args.record }));
        }
      }
    });
  }

  await pipe.ensureShare();
  if (aiActive(args.ai)) {
    plainStatus(t("status.aiOnModel", { model: args.ai.model }));
  }

  let exitCode = 0;
  try {
    await transcribe(args, pipe.onAsr, stop, plainStatus);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    exitCode = 1;
  } finally {
    try {
      pipe.close();
    } catch {
      /* ignore */
    }
    try {
      flushSaveSettings(() => snapshotFromArgs(args));
    } catch {
      /* ignore */
    }
    close();
    try {
      if (process.stdin.isTTY) process.stdin.pause();
    } catch {
      /* ignore */
    }
    plainStatus(t("status.exited"));
  }
  hardExit(exitCode);
}

async function runJoin(
  url: string,
  opts: { noTui: boolean; output?: string },
) {
  const stop = { value: false };

  if (!opts.noTui && process.stdout.isTTY) {
    const ui = loadSettings().uiLang ?? detectUiLang();
    setUiLang(ui);
    const args: TranscribeArgs = {
      lang: "auto",
      uiLang: ui,
      source: "mic",
      noSpk: true,
      spkThreshold: 0.55,
      noTui: false,
      recordDir: defaultRecordDir(),
      paused: { value: false },
      ai: { ...DEFAULT_AI, enabled: false },
      share: { ...DEFAULT_SHARE, enabled: false },
      vad: { ...DEFAULT_VAD },
      output: opts.output,
    };
    const tui = createTui(args, {
      onQuit: () => {
        stop.value = true;
        join.close();
        tui.close();
        hardExit(0);
      },
    });
    tui.setDevice("share");
    tui.setStatus(t("status.joining", { url }));

    const join = joinShareSession(url, {
      onSegment: (seg) => tui.emit(seg),
      onStatus: (m) => tui.setStatus(m),
      onClose: () => {
        if (!stop.value) {
          tui.setStatus(t("status.connClosed"));
        }
      },
    });

    process.on("SIGINT", () => {
      stop.value = true;
      join.close();
      tui.close();
      hardExit(0);
    });

    await tui.waitClosed();
    join.close();
    hardExit(0);
  }

  // plain join
  const { emit, close } = createEmitter(opts.output);
  plainStatus(t("plain.joining", { url }));
  const join = joinShareSession(url, {
    onSegment: emit,
    onStatus: plainStatus,
  });
  process.on("SIGINT", () => {
    join.close();
    close();
    hardExit(0);
  });
  // keep alive
  await new Promise<void>(() => {
    /* until SIGINT */
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
