import { existsSync } from "node:fs";

import { spawn, type IPty } from "node-pty";
import { describe, expect, it } from "vitest";

import { prepareShellIntegration } from "../src/main/shellIntegration.js";

const START = "\u001b]133;C\u0007";
const FAILURE = "\u001b]133;D;1\u0007";

describe("shell integration over a real PTY", () => {
  for (const shell of ["/usr/bin/zsh", "/usr/bin/bash", "/usr/bin/fish"]) {
    it.skipIf(!existsSync(shell))(
      `emits command start and exit code markers in ${shell}`,
      async () => {
        const command = prepareShellIntegration(
          { file: shell, args: ["-l"] },
          { HOME: "/tmp/vintage-empty-test-home", PATH: process.env.PATH || "/usr/bin" },
        );
        const childRef: { current: IPty | null } = { current: null };

        try {
          const output = await new Promise<string>((resolve, reject) => {
            let captured = "";
            let commandSent = false;
            let exitSent = false;
            const timer = setTimeout(() => {
              childRef.current?.kill();
              reject(new Error(`Timed out waiting for OSC 133 markers from ${shell}`));
            }, 5000);

            childRef.current = spawn(command.file, command.args, {
              name: "xterm-256color",
              cols: 80,
              rows: 24,
              cwd: "/tmp",
              env: command.env,
            });
            childRef.current.onData((data) => {
              captured += data;
              if (!commandSent && captured.includes("\u001b]133;A\u0007")) {
                commandSent = true;
                childRef.current?.write("false\r");
              }
              if (!exitSent && captured.includes(FAILURE)) {
                exitSent = true;
                childRef.current?.write("exit\r");
              }
            });
            childRef.current.onExit(() => {
              clearTimeout(timer);
              resolve(captured);
            });
          });

          expect(output).toContain(START);
          // oxlint-disable-next-line no-control-regex -- OSC protocol assertions use control terminators.
          expect(output).toMatch(/\u001b\]133;E;\s*false\u0007/u);
          expect(output).toContain(FAILURE);
        } finally {
          childRef.current?.kill();
          command.cleanup();
        }
      },
    );
  }
});
