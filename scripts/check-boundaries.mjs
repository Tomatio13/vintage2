import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const errors = [];

await inspect("src/renderer", (source, file) => {
  if (/from\s+["'](?:electron|node:)/u.test(source)) {
    errors.push(`${file}: renderer must not import Electron or Node.js modules`);
  }
});

await inspect("src/main", (source, file) => {
  if (/from\s+["'][^"']*renderer/u.test(source)) {
    errors.push(`${file}: main must not import renderer implementation`);
  }
  inspectIpcSenderValidation(source, file);
});

await inspect("src/preload", (source, file) => {
  if (/from\s+["'][^"']*renderer/u.test(source)) {
    errors.push(`${file}: preload must not import renderer implementation`);
  }
});

await inspect("src", (source, file) => {
  if (source.includes("@zcode/"))
    errors.push(`${file}: starter must not depend on @zcode packages`);
});

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("boundaries: OK");
}

async function inspect(directory, check) {
  const absolute = join(root, directory);
  for (const file of await walk(absolute)) {
    check(await readFile(file, "utf8"), relative(root, file));
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

function inspectIpcSenderValidation(source, file) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const trustedChecks = new Set(["resolveSenderWindow", "assertTrustedSender"]);

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "ipcMain" &&
      ["handle", "on"].includes(node.expression.name.text)
    ) {
      const callback = node.arguments.at(-1);
      if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) {
        report(
          node,
          "IPC registration must use an inline callback so sender validation is auditable",
        );
      } else {
        const event = callback.parameters[0]?.name;
        if (!event || !ts.isIdentifier(event) || !containsTrustedCheck(callback.body, event.text)) {
          report(
            node,
            "IPC callback must validate its event with resolveSenderWindow or assertTrustedSender",
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  const containsTrustedCheck = (body, eventName) => {
    let found = false;
    const search = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        trustedChecks.has(node.expression.text) &&
        node.arguments.some((argument) => ts.isIdentifier(argument) && argument.text === eventName)
      ) {
        found = true;
      }
      if (!found) ts.forEachChild(node, search);
    };
    search(body);
    return found;
  };

  const report = (node, message) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    errors.push(`${file}:${line + 1}: ${message}`);
  };

  visit(sourceFile);
}
