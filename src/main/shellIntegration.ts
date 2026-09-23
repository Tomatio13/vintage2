import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

export interface ShellCommand {
  file: string;
  args: string[];
}

export interface IntegratedShellCommand extends ShellCommand {
  env: Record<string, string>;
  cleanup(): void;
}

export function prepareShellIntegration(
  command: ShellCommand,
  environment: Record<string, string>,
): IntegratedShellCommand {
  const shell = basename(command.file).toLowerCase();
  if (shell !== "zsh" && shell !== "bash" && shell !== "fish") {
    return { ...command, env: environment, cleanup() {} };
  }

  const directory = mkdtempSync(join(tmpdir(), "vintage-shell-"));
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    rmSync(directory, { force: true, recursive: true });
  };

  try {
    if (shell === "zsh") return prepareZsh(command.file, environment, directory, cleanup);
    if (shell === "bash") return prepareBash(command.file, environment, directory, cleanup);
    return prepareFish(command.file, environment, directory, cleanup);
  } catch (error) {
    cleanup();
    throw error;
  }
}

function prepareZsh(
  file: string,
  environment: Record<string, string>,
  directory: string,
  cleanup: () => void,
): IntegratedShellCommand {
  const userDirectory = environment.ZDOTDIR || environment.HOME || "";
  const sourceUserFile = (name: string) =>
    `[[ -r "$VINTAGE_USER_ZDOTDIR/${name}" ]] && source "$VINTAGE_USER_ZDOTDIR/${name}"\nexport ZDOTDIR="$VINTAGE_INTEGRATION_ZDOTDIR"\n`;

  writeFileSync(join(directory, ".zshenv"), sourceUserFile(".zshenv"));
  writeFileSync(join(directory, ".zprofile"), sourceUserFile(".zprofile"));
  writeFileSync(
    join(directory, ".zshrc"),
    sourceUserFile(".zshrc") +
      [
        'if [[ -z "${VINTAGE_SHELL_INTEGRATION_ACTIVE:-}" ]]; then',
        "  typeset -g VINTAGE_SHELL_INTEGRATION_ACTIVE=1",
        "  autoload -Uz add-zsh-hook",
        "  function __vintage_preexec() { printf '\\e]133;C\\a\\e]133;E;%s\\a' \"$1\" }",
        "  function __vintage_precmd() {",
        "    local exit_code=$?",
        '    printf \'\\e]133;D;%s\\a\\e]7;file://%s%s\\a\\e]133;A\\a\' "$exit_code" "$HOST" "$PWD"',
        "  }",
        "  add-zsh-hook preexec __vintage_preexec",
        "  add-zsh-hook precmd __vintage_precmd",
        "  typeset -g VINTAGE_PROMPT_END=$'\\e]133;B\\a'",
        '  PROMPT="${PROMPT}%{${VINTAGE_PROMPT_END}%}"',
        "fi",
        "",
      ].join("\n"),
  );
  writeFileSync(join(directory, ".zlogin"), sourceUserFile(".zlogin"));
  writeFileSync(join(directory, ".zlogout"), sourceUserFile(".zlogout"));

  return {
    file,
    args: ["-l"],
    env: {
      ...environment,
      VINTAGE_USER_ZDOTDIR: userDirectory,
      VINTAGE_INTEGRATION_ZDOTDIR: directory,
      ZDOTDIR: directory,
    },
    cleanup,
  };
}

function prepareBash(
  file: string,
  environment: Record<string, string>,
  directory: string,
  cleanup: () => void,
): IntegratedShellCommand {
  const rcFile = join(directory, "bashrc");
  writeFileSync(
    rcFile,
    [
      "[[ -r /etc/profile ]] && source /etc/profile",
      'if [[ -r "$VINTAGE_USER_HOME/.bash_profile" ]]; then',
      '  source "$VINTAGE_USER_HOME/.bash_profile"',
      'elif [[ -r "$VINTAGE_USER_HOME/.bash_login" ]]; then',
      '  source "$VINTAGE_USER_HOME/.bash_login"',
      'elif [[ -r "$VINTAGE_USER_HOME/.profile" ]]; then',
      '  source "$VINTAGE_USER_HOME/.profile"',
      "fi",
      'if [[ -z "${VINTAGE_SHELL_INTEGRATION_ACTIVE:-}" ]]; then',
      "  VINTAGE_SHELL_INTEGRATION_ACTIVE=1",
      "  __vintage_prompt_command() {",
      "    local exit_code=$?",
      "    local command_line",
      "    command_line=$(builtin fc -ln -1 2>/dev/null)",
      "    printf '\\e]133;E;%s\\a' \"$command_line\"",
      '    printf \'\\e]133;D;%s\\a\\e]7;file://%s%s\\a\\e]133;A\\a\' "$exit_code" "${HOSTNAME:-localhost}" "$PWD"',
      "  }",
      "  if declare -p PROMPT_COMMAND 2>/dev/null | grep -q 'declare -a'; then",
      '    PROMPT_COMMAND=(__vintage_prompt_command "${PROMPT_COMMAND[@]}")',
      "  else",
      '    PROMPT_COMMAND="__vintage_prompt_command${PROMPT_COMMAND:+;${PROMPT_COMMAND}}"',
      "  fi",
      "  PS0=$'\\e]133;C\\a'\"${PS0:-}\"",
      '  PS1="${PS1}\\[\\e]133;B\\a\\]"',
      "fi",
      "",
    ].join("\n"),
  );

  return {
    file,
    args: ["--noprofile", "--rcfile", rcFile, "-i"],
    env: { ...environment, VINTAGE_USER_HOME: environment.HOME || "" },
    cleanup,
  };
}

function prepareFish(
  file: string,
  environment: Record<string, string>,
  directory: string,
  cleanup: () => void,
): IntegratedShellCommand {
  const integrationFile = join(directory, "integration.fish");
  writeFileSync(
    integrationFile,
    [
      "if not set -q VINTAGE_SHELL_INTEGRATION_ACTIVE",
      "  set -g VINTAGE_SHELL_INTEGRATION_ACTIVE 1",
      "  function __vintage_preexec --on-event fish_preexec",
      "    printf '\\e]133;C\\a\\e]133;E;%s\\a' \"$argv\"",
      "  end",
      "  function __vintage_postexec --on-event fish_postexec",
      "    printf '\\e]133;D;%s\\a' $status",
      "  end",
      "  if functions -q fish_prompt",
      "    functions -c fish_prompt __vintage_original_fish_prompt",
      "    function fish_prompt",
      "      printf '\\e]7;file://%s%s\\a\\e]133;A\\a' (hostname) $PWD",
      "      __vintage_original_fish_prompt",
      "      printf '\\e]133;B\\a'",
      "    end",
      "  end",
      "end",
      "",
    ].join("\n"),
  );

  return {
    file,
    args: ["-l", "--init-command", `source "${integrationFile}"`],
    env: environment,
    cleanup,
  };
}
